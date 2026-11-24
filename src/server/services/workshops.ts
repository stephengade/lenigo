import "server-only";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { modules, spaceMembers, submissions, users, workshopRsvps, workshops } from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { logActivity } from "@/server/activity";
import { awardPoints } from "@/server/points/rules";
import { space as spaceRules } from "@/lib/permissions";

export type WorkshopInput = {
  title: string;
  kind: "WORKSHOP" | "STANDUP_REVIEW";
  type: "ONLINE_CALL" | "PHYSICAL";
  startsAt: string;
  endsAt?: string | null;
  meetingUrl?: string | null;
  venue?: string | null;
  agendaMd?: string | null;
};

export async function listWorkshops(a: MemberAccess) {
  const now = new Date();
  // Upcoming includes anything that started in the last 6 hours, so attendance can still be marked.
  const cutoff = new Date(now.getTime() - 6 * 3600_000);
  const [upcoming, past] = await Promise.all([
    db.select().from(workshops).where(and(eq(workshops.spaceId, a.space.id), gte(workshops.startsAt, cutoff))).orderBy(asc(workshops.startsAt)).limit(30),
    db.select().from(workshops).where(and(eq(workshops.spaceId, a.space.id), lt(workshops.startsAt, cutoff))).orderBy(desc(workshops.startsAt)).limit(20),
  ]);
  const all = [...upcoming, ...past];
  const rsvps = all.length
    ? await db
        .select({
          rsvp: workshopRsvps,
          user: { id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl },
          presenting: { id: submissions.id, repoUrl: submissions.repoUrl, liveUrl: submissions.liveUrl, module: modules.title },
        })
        .from(workshopRsvps)
        .innerJoin(users, eq(users.id, workshopRsvps.userId))
        .leftJoin(submissions, eq(submissions.id, workshopRsvps.submissionId))
        .leftJoin(modules, eq(modules.id, submissions.moduleId))
        .where(inArray(workshopRsvps.workshopId, all.map((w) => w.id)))
        .orderBy(asc(workshopRsvps.createdAt))
    : [];
  const staff = spaceRules.canMarkAttendance(a.spaceRole);
  const shape = (w: (typeof all)[number]) => {
    const list = rsvps.filter((r) => r.rsvp.workshopId === w.id);
    const mine = list.find((r) => r.rsvp.userId === a.user.id) ?? null;
    return {
      ...w,
      // The call link is for people who RSVP'd (and staff), not the whole internet.
      meetingUrl: staff || mine ? w.meetingUrl : null,
      started: w.startsAt <= now,
      going: list.length,
      mine: mine ? { attended: mine.rsvp.attended, presenting: mine.presenting?.id ? mine.presenting : null } : null,
      attendees: staff || w.kind === "STANDUP_REVIEW" ? list.map((r) => ({ ...r.user, attended: r.rsvp.attended, presenting: r.presenting?.id ? r.presenting : null })) : [],
      canManage: staff && (w.createdById === a.user.id || spaceRules.canModerate(a.spaceRole)),
    };
  };
  return { upcoming: upcoming.map(shape), past: past.map(shape) };
}

const httpsUrl = (raw: string | null | undefined) => {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw fail.badRequest("The meeting link must be an https link.");
  }
};

export async function createWorkshop(a: MemberAccess, input: WorkshopInput) {
  if (!spaceRules.canScheduleWorkshops(a.spaceRole)) throw fail.forbidden("Mentors and above schedule sessions.");
  const title = input.title.trim();
  if (title.length < 3) throw fail.badRequest("Give the session a title.");
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (Number.isNaN(startsAt.getTime())) throw fail.badRequest("Pick a start time.");
  if (startsAt.getTime() < Date.now() - 5 * 60_000) throw fail.badRequest("The start time is in the past.");
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) throw fail.badRequest("The end time must be after the start.");
  const meetingUrl = httpsUrl(input.meetingUrl);
  const venue = input.venue?.trim() || null;
  if (input.type === "ONLINE_CALL" && !meetingUrl) throw fail.badRequest("Add the call link.");
  if (input.type === "PHYSICAL" && !venue) throw fail.badRequest("Add the venue.");
  const [row] = await db
    .insert(workshops)
    .values({ spaceId: a.space.id, title, kind: input.kind, type: input.type, startsAt, endsAt, meetingUrl, venue, agendaMd: input.agendaMd?.trim() || null, createdById: a.user.id })
    .returning({ id: workshops.id });
  await logActivity({ actorUserId: a.user.id, actionType: "WORKSHOP_CREATED", communityId: a.community.id, spaceId: a.space.id, entityType: "workshop", entityId: row.id, metadata: { title, kind: input.kind } });
  return row;
}

async function workshopInSpace(a: MemberAccess, id: string) {
  const [w] = await db.select().from(workshops).where(and(eq(workshops.id, id), eq(workshops.spaceId, a.space.id))).limit(1);
  if (!w) throw fail.notFound("Session not found");
  return w;
}

export async function cancelWorkshop(a: MemberAccess, id: string) {
  const w = await workshopInSpace(a, id);
  if (!(spaceRules.canMarkAttendance(a.spaceRole) && (w.createdById === a.user.id || spaceRules.canModerate(a.spaceRole)))) throw fail.forbidden();
  if (w.startsAt <= new Date()) throw fail.conflict("This session has started; it stays on record.");
  await db.delete(workshops).where(eq(workshops.id, w.id));
  await logActivity({ actorUserId: a.user.id, actionType: "WORKSHOP_CANCELLED", communityId: a.community.id, spaceId: a.space.id, entityType: "workshop", entityId: w.id, metadata: { title: w.title } });
}

/** RSVP (optionally with a project to present at a live review), or change it. */
export async function rsvp(a: MemberAccess, id: string, input: { going: boolean; submissionId?: string | null }) {
  const w = await workshopInSpace(a, id);
  const [existing] = await db.select().from(workshopRsvps).where(and(eq(workshopRsvps.workshopId, w.id), eq(workshopRsvps.userId, a.user.id))).limit(1);
  if (!input.going) {
    if (existing?.attended) throw fail.conflict("Your attendance is already recorded.");
    await db.delete(workshopRsvps).where(and(eq(workshopRsvps.workshopId, w.id), eq(workshopRsvps.userId, a.user.id)));
    return { going: false };
  }
  if (w.endsAt ? w.endsAt <= new Date() : w.startsAt.getTime() + 3 * 3600_000 <= Date.now()) throw fail.conflict("This session is over.");
  let submissionId: string | null = null;
  if (input.submissionId) {
    if (w.kind !== "STANDUP_REVIEW") throw fail.badRequest("Projects are presented at standup reviews.");
    const [s] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.id, input.submissionId), eq(submissions.userId, a.user.id), eq(submissions.spaceId, a.space.id)))
      .limit(1);
    if (!s) throw fail.badRequest("Pick one of your own projects.");
    submissionId = s.id;
  }
  if (existing) {
    await db.update(workshopRsvps).set({ submissionId }).where(and(eq(workshopRsvps.workshopId, w.id), eq(workshopRsvps.userId, a.user.id)));
  } else {
    await db.insert(workshopRsvps).values({ workshopId: w.id, userId: a.user.id, submissionId }).onConflictDoNothing();
  }
  return { going: true };
}

/** Staff mark who attended. Awards points once; can't be undone (DB trigger), only adjusted. */
export async function markAttendance(a: MemberAccess, id: string, userId: string) {
  if (!spaceRules.canMarkAttendance(a.spaceRole)) throw fail.forbidden();
  if (userId === a.user.id) throw fail.forbidden("Someone else marks your attendance.");
  const w = await workshopInSpace(a, id);
  if (w.startsAt > new Date()) throw fail.conflict("Mark attendance once the session has started.");
  const [member] = await db.select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, a.space.id), eq(spaceMembers.userId, userId))).limit(1);
  if (!member) throw fail.notFound("That person isn't in this space.");

  await db.transaction(async (tx) => {
    const now = new Date();
    const [r] = await tx
      .insert(workshopRsvps)
      .values({ workshopId: w.id, userId, attended: true, attendedAt: now, markedById: a.user.id })
      .onConflictDoUpdate({ target: [workshopRsvps.workshopId, workshopRsvps.userId], set: { attended: true, attendedAt: now, markedById: a.user.id } })
      .returning({ attended: workshopRsvps.attended });
    if (!r?.attended) throw fail.conflict("Couldn't record attendance.");
    await awardPoints(
      {
        spaceId: a.space.id,
        communityId: a.community.id,
        userId,
        reason: w.kind === "STANDUP_REVIEW" ? "REVIEW_SESSION_ATTENDED" : "WORKSHOP_ATTENDED",
        dedupeKey: `workshop:${w.id}`,
        refId: w.id,
      },
      tx,
    );
    await logActivity(
      { actorUserId: a.user.id, actionType: "ATTENDANCE_MARKED", communityId: a.community.id, spaceId: a.space.id, entityType: "workshop", entityId: w.id, metadata: { attendee: userId } },
      tx,
    );
  });
}

/** The caller's projects they could present at a standup review. */
export async function myPresentableProjects(a: MemberAccess) {
  return db
    .select({ id: submissions.id, module: modules.title, status: submissions.status })
    .from(submissions)
    .innerJoin(modules, eq(modules.id, submissions.moduleId))
    .where(and(eq(submissions.userId, a.user.id), eq(submissions.spaceId, a.space.id)))
    .orderBy(desc(submissions.createdAt))
    .limit(20);
}
