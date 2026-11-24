import "server-only";
import { after } from "next/server";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  communities,
  levelPromotions,
  levels,
  modules,
  placementAttempts,
  spaces,
  submissions,
  tracks,
  users,
  workshopRsvps,
  workshops,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { canSendEmail, sendEmail } from "@/server/email/send";
import NotificationEmail, { type NotificationEmailProps } from "@/emails/notification";

/**
 * Learning emails: project reviewed, promoted, placement result, session reminder or cancelled.
 * - Sent after the response (Next's `after`), so a slow or failing mailer never blocks or undoes
 *   the action. Outside a request (scripts, tests) they run inline instead.
 * - Only to the person concerned; skipped if they turned learning emails off or are deactivated.
 * - Never include points or point weights (learning rule 7). Feedback is the mentor's own words.
 */
export function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const run = () =>
    task().then(
      () => undefined,
      (e) => console.error("[notify] failed", e),
    );
  try {
    after(run);
    return Promise.resolve();
  } catch {
    return run(); // not inside a request
  }
}

const app = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

async function recipient(userId: string) {
  const [u] = await db
    .select({ email: users.email, name: users.name, username: users.username, on: users.emailNotifications, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u && u.on && !u.deactivatedAt ? u : null;
}

async function placeOf(spaceId: string) {
  const [p] = await db
    .select({ cSlug: communities.slug, cName: communities.name, sSlug: spaces.slug, sName: spaces.name, timezone: communities.timezone })
    .from(spaces)
    .innerJoin(communities, eq(communities.id, spaces.communityId))
    .where(eq(spaces.id, spaceId))
    .limit(1);
  return p ? { ...p, base: `${app()}/c/${p.cSlug}/${p.sSlug}`, label: `${p.cName} · ${p.sName}` } : null;
}

const nameOf = async (userId: string | null) => {
  if (!userId) return "A mentor";
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? "A mentor";
};

async function deliver(
  to: NonNullable<Awaited<ReturnType<typeof recipient>>>,
  subject: string,
  props: Omit<NotificationEmailProps, "settingsUrl">,
): Promise<boolean> {
  if (!canSendEmail()) return true; // nothing to retry: email isn't set up
  const settingsUrl = to.username ? `${app()}/u/${to.username}` : app();
  const res = await sendEmail({ to: to.email, toName: to.name, subject, react: NotificationEmail({ ...props, settingsUrl }) });
  if (!res.ok) console.error(`[notify] "${subject}" not sent: ${res.error}`);
  return res.ok;
}

/* ── Project reviewed ──────────────────────────────────────────────── */

export async function notifyProjectReviewed(submissionId: string) {
  const [row] = await db
    .select({ s: submissions, module: modules.title, moduleId: modules.id, track: tracks.title })
    .from(submissions)
    .innerJoin(modules, eq(modules.id, submissions.moduleId))
    .innerJoin(levels, eq(levels.id, modules.levelId))
    .innerJoin(tracks, eq(tracks.id, levels.trackId))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  if (!row || row.s.status === "PENDING") return;
  const [to, place, reviewer] = await Promise.all([recipient(row.s.userId), placeOf(row.s.spaceId), nameOf(row.s.reviewedById)]);
  if (!to || !place) return;
  const approved = row.s.status === "APPROVED";
  await deliver(to, approved ? `Approved: ${row.module}` : `Changes requested: ${row.module}`, {
    eyebrow: "Project reviewed",
    title: approved ? `Approved: ${row.module}` : `Changes requested: ${row.module}`,
    lines: approved
      ? [`${reviewer} approved your project for “${row.module}” in ${row.track}. Your roadmap has moved on.`]
      : [`${reviewer} reviewed your project for “${row.module}” in ${row.track} and asked for a few changes. Make them, then resubmit from the module page.`],
    quote: row.s.mentorFeedback ? { text: row.s.mentorFeedback, by: reviewer } : null,
    button: approved ? { label: "Open your roadmap", url: `${place.base}/roadmap` } : { label: "Open the module", url: `${place.base}/modules/${row.moduleId}` },
    place: place.label,
  });
}

/* ── Promoted ──────────────────────────────────────────────────────── */

export async function notifyPromoted(promotionId: string) {
  const [row] = await db
    .select({ p: levelPromotions, track: tracks.title })
    .from(levelPromotions)
    .innerJoin(tracks, eq(tracks.id, levelPromotions.trackId))
    .where(eq(levelPromotions.id, promotionId))
    .limit(1);
  if (!row) return;
  const [lvl] = await db
    .select({ title: levels.title })
    .from(levels)
    .where(and(eq(levels.trackId, row.p.trackId), eq(levels.tier, row.p.toLevel)))
    .limit(1);
  const [to, place, by] = await Promise.all([recipient(row.p.userId), placeOf(row.p.spaceId), nameOf(row.p.promotedById)]);
  if (!to || !place) return;
  const level = lvl?.title ?? row.p.toLevel.toLowerCase();
  await deliver(to, `You're now ${level} in ${row.track}`, {
    eyebrow: "Level up",
    title: `You're now ${level}`,
    lines: [`${by} moved you up to ${level} in ${row.track}. The next modules are open on your roadmap.`],
    quote: { text: row.p.reason, by },
    button: { label: "Open your roadmap", url: `${place.base}/roadmap` },
    place: place.label,
  });
}

/* ── Placement test reviewed ───────────────────────────────────────── */

export async function notifyPlacementReviewed(attemptId: string) {
  const [row] = await db
    .select({ a: placementAttempts, track: tracks.title })
    .from(placementAttempts)
    .innerJoin(tracks, eq(tracks.id, placementAttempts.trackId))
    .where(eq(placementAttempts.id, attemptId))
    .limit(1);
  if (!row || (row.a.status !== "RECOMMENDED" && row.a.status !== "NOT_RECOMMENDED")) return;
  const [to, place, by] = await Promise.all([recipient(row.a.userId), placeOf(row.a.spaceId), nameOf(row.a.reviewerId)]);
  if (!to || !place) return;
  const yes = row.a.status === "RECOMMENDED";
  await deliver(to, `Your ${row.track} placement test was reviewed`, {
    eyebrow: "Placement test",
    title: yes ? "Recommended for a higher level" : "Start from the first level",
    lines: yes
      ? [`${by} reviewed your ${row.track} placement test and recommended you move up. A Mentor or Lead will confirm your new level.`]
      : [`${by} reviewed your ${row.track} placement test. For now, start from the first level; you can take the test again after 30 days.`],
    quote: row.a.reviewFeedback ? { text: row.a.reviewFeedback, by } : null,
    button: { label: "Open your roadmap", url: `${place.base}/roadmap` },
    place: place.label,
  });
}

/* ── Sessions ──────────────────────────────────────────────────────── */

/** "Fri 28 Nov, 6:00 pm (Africa/Lagos)". An unknown zone falls back to UTC instead of throwing. */
function when(d: Date, timeZone: string) {
  const opts = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true } as const;
  try {
    return `${new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(d)} (${timeZone})`;
  } catch {
    return `${new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d)} (UTC)`;
  }
}

/** Tell everyone who RSVP'd that a session was cancelled. Call with the rows read before deleting it. */
export async function notifyWorkshopCancelled(w: { title: string; startsAt: Date; spaceId: string }, userIds: string[]) {
  const place = await placeOf(w.spaceId);
  if (!place || !userIds.length) return;
  for (const id of userIds) {
    const to = await recipient(id);
    if (!to) continue;
    await deliver(to, `Cancelled: ${w.title}`, {
      eyebrow: "Session cancelled",
      title: `Cancelled: ${w.title}`,
      lines: [`The session on ${when(w.startsAt, place.timezone)} won't go ahead. Check the sessions page for what's next.`],
      button: { label: "See sessions", url: `${place.base}/workshops` },
      place: place.label,
    });
  }
}

/** Sessions starting within this window get a reminder (once per person). */
export const REMINDER_WINDOW_MS = 24 * 3_600_000;

/**
 * Emails a reminder to everyone who RSVP'd to a session starting in the next 24 hours. Each RSVP
 * is claimed in one UPDATE (reminded_at), so overlapping runs never send twice. Run it from a
 * scheduler (see /cron/workshop-reminders). Returns how many reminders were claimed.
 */
export async function sendWorkshopReminders(now = new Date()) {
  const claimed = await db
    .update(workshopRsvps)
    .set({ remindedAt: now })
    .where(
      and(
        isNull(workshopRsvps.remindedAt),
        inArray(
          workshopRsvps.workshopId,
          db
            .select({ id: workshops.id })
            .from(workshops)
            .where(and(gt(workshops.startsAt, now), lte(workshops.startsAt, new Date(now.getTime() + REMINDER_WINDOW_MS)))),
        ),
      ),
    )
    .returning({ workshopId: workshopRsvps.workshopId, userId: workshopRsvps.userId, presenting: sql<boolean>`${workshopRsvps.submissionId} is not null` });
  if (!claimed.length) return 0;

  const ws = await db.select().from(workshops).where(inArray(workshops.id, [...new Set(claimed.map((c) => c.workshopId))]));
  const byId = new Map(ws.map((w) => [w.id, w]));
  let sent = 0;
  for (const c of claimed) {
    let ok = false;
    try {
      const w = byId.get(c.workshopId);
      const [to, place] = await Promise.all([recipient(c.userId), w ? placeOf(w.spaceId) : null]);
      if (!w || !to || !place) {
        ok = true; // opted out, deactivated or gone: nothing to send, don't retry
      } else {
        const where = w.type === "PHYSICAL" ? `At ${w.venue}.` : "Online: the call link is on the sessions page.";
        ok = await deliver(to, `Reminder: ${w.title}`, {
          eyebrow: w.kind === "STANDUP_REVIEW" ? "Standup review" : "Workshop",
          title: w.title,
          lines: [`Starts ${when(w.startsAt, place.timezone)}. ${where}`, ...(c.presenting ? ["You're on the list to present your project."] : [])],
          button: { label: "Open the session", url: `${place.base}/workshops` },
          place: place.label,
        });
        if (ok) sent++;
      }
    } catch (e) {
      console.error("[notify] reminder failed", e);
    }
    // Not sent: release the claim so the next run tries again.
    if (!ok) {
      await db
        .update(workshopRsvps)
        .set({ remindedAt: null })
        .where(and(eq(workshopRsvps.workshopId, c.workshopId), eq(workshopRsvps.userId, c.userId)))
        .catch((e) => console.error("[notify] couldn't release reminder claim", e));
    }
  }
  return sent;
}
