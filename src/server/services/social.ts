import "server-only";
import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  feedComments,
  feedItems,
  feedReactions,
  leaderboardSnapshots,
  modules,
  standups,
  streaks,
  submissions,
  users,
} from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { awardPoints } from "@/server/points/rules";
import { addDays, liveStreak, localDate, STREAK_MILESTONES } from "@/lib/dates";
import { space as spaceRules } from "@/lib/permissions";

/** The reactions a feed post can get. A fixed set keeps the feed friendly and moderation simple. */
export const REACTIONS = ["🔥", "👏", "💡", "🙌", "❤️"] as const;
export type Reaction = (typeof REACTIONS)[number];

const author = { id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, username: users.username };

/* ── Standups and streaks ─────────────────────────────────────────── */

export async function getTodayStandup(a: MemberAccess) {
  const today = localDate(a.community.timezone);
  const [row] = await db.select().from(standups).where(and(eq(standups.spaceId, a.space.id), eq(standups.userId, a.user.id), eq(standups.localDate, today))).limit(1);
  return row ?? null;
}

export async function getStreak(a: MemberAccess, userId = a.user.id) {
  const [row] = await db.select().from(streaks).where(and(eq(streaks.spaceId, a.space.id), eq(streaks.userId, userId))).limit(1);
  const today = localDate(a.community.timezone);
  return { current: row ? liveStreak(row.current, row.lastActiveDate, today) : 0, longest: row?.longest ?? 0 };
}

/**
 * One standup per learner per space per local day. Posting also: keeps the streak, awards
 * STANDUP points, and at a milestone (3, 7, 14… days) a STREAK_BONUS and a feed post.
 */
export async function postStandup(a: MemberAccess, input: { didToday: string; nextStep: string; blockers?: string | null; moduleId?: string | null }) {
  const didToday = input.didToday.trim();
  const nextStep = input.nextStep.trim();
  const blockers = input.blockers?.trim() || null;
  if (didToday.length < 10) throw fail.badRequest("Say a bit more about what you did today.");
  if (nextStep.length < 5) throw fail.badRequest("What's your next step?");
  if (didToday.length > 1500 || nextStep.length > 600 || (blockers?.length ?? 0) > 600) throw fail.badRequest("Keep your standup short.");
  if (input.moduleId) {
    const [m] = await db.select({ id: modules.id }).from(modules).where(and(eq(modules.id, input.moduleId), eq(modules.spaceId, a.space.id))).limit(1);
    if (!m) throw fail.badRequest("That module isn't in this space.");
  }
  const today = localDate(a.community.timezone);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(standups)
      .values({ spaceId: a.space.id, userId: a.user.id, moduleId: input.moduleId ?? null, didToday, nextStep, blockers, localDate: today })
      .onConflictDoNothing()
      .returning({ id: standups.id });
    if (!row) throw fail.conflict("You've already posted today's standup. Come back tomorrow.");

    const [prev] = await tx.select().from(streaks).where(and(eq(streaks.spaceId, a.space.id), eq(streaks.userId, a.user.id))).for("update").limit(1);
    const current = prev?.lastActiveDate === addDays(today, -1) ? prev.current + 1 : prev?.lastActiveDate === today ? prev.current : 1;
    const longest = Math.max(current, prev?.longest ?? 0);
    await tx
      .insert(streaks)
      .values({ spaceId: a.space.id, userId: a.user.id, current, longest, lastActiveDate: today })
      .onConflictDoUpdate({ target: [streaks.spaceId, streaks.userId], set: { current, longest, lastActiveDate: today, updatedAt: new Date() } });

    await tx.insert(feedItems).values({ spaceId: a.space.id, actorUserId: a.user.id, kind: "STANDUP", refId: row.id, helpNeeded: !!blockers });
    await awardPoints({ spaceId: a.space.id, communityId: a.community.id, userId: a.user.id, reason: "STANDUP", dedupeKey: `standup:${today}`, refId: row.id }, tx);

    const milestone = (STREAK_MILESTONES as readonly number[]).includes(current);
    if (milestone) {
      await awardPoints(
        { spaceId: a.space.id, communityId: a.community.id, userId: a.user.id, reason: "STREAK_BONUS", dedupeKey: `streak:${current}:${today}`, refId: row.id },
        tx,
      );
      await tx.insert(feedItems).values({ spaceId: a.space.id, actorUserId: a.user.id, kind: "STREAK_MILESTONE", refId: row.id, meta: { days: current } });
    }
    return { id: row.id, streak: current, milestone: milestone ? current : null };
  });
}

/* ── Feed ─────────────────────────────────────────────────────────── */

const PAGE = 20;

export async function listFeed(a: MemberAccess, opts: { before?: Date | null; helpOnly?: boolean } = {}) {
  const items = await db
    .select({ item: feedItems, actor: author })
    .from(feedItems)
    .innerJoin(users, eq(users.id, feedItems.actorUserId))
    .where(and(eq(feedItems.spaceId, a.space.id), opts.before ? lt(feedItems.createdAt, opts.before) : undefined, opts.helpOnly ? eq(feedItems.helpNeeded, true) : undefined))
    .orderBy(desc(feedItems.createdAt))
    .limit(PAGE + 1);
  const page = items.slice(0, PAGE);
  const ids = page.map((p) => p.item.id);
  const standupIds = page.filter((p) => p.item.kind === "STANDUP" && p.item.refId).map((p) => p.item.refId!);
  const submissionIds = page.filter((p) => p.item.kind === "PROJECT_APPROVED" && p.item.refId).map((p) => p.item.refId!);

  const [reactions, comments, stand, subs] = await Promise.all([
    ids.length ? db.select({ feedItemId: feedReactions.feedItemId, emoji: feedReactions.emoji, userId: feedReactions.userId }).from(feedReactions).where(inArray(feedReactions.feedItemId, ids)) : [],
    ids.length
      ? db
          .select({ comment: feedComments, author })
          .from(feedComments)
          .innerJoin(users, eq(users.id, feedComments.userId))
          .where(inArray(feedComments.feedItemId, ids))
          .orderBy(asc(feedComments.createdAt))
      : [],
    standupIds.length
      ? db
          .select({ standup: standups, module: modules.title })
          .from(standups)
          .leftJoin(modules, eq(modules.id, standups.moduleId))
          .where(inArray(standups.id, standupIds))
      : [],
    // Project posts link the work, never the score.
    submissionIds.length ? db.select({ id: submissions.id, repoUrl: submissions.repoUrl, liveUrl: submissions.liveUrl }).from(submissions).where(inArray(submissions.id, submissionIds)) : [],
  ]);

  return {
    nextBefore: items.length > PAGE ? page[page.length - 1].item.createdAt.toISOString() : null,
    items: page.map(({ item, actor }) => {
      const mine = reactions.filter((r) => r.feedItemId === item.id);
      return {
        id: item.id,
        kind: item.kind,
        createdAt: item.createdAt,
        helpNeeded: item.helpNeeded,
        meta: item.meta,
        actor,
        standup: stand.find((s) => s.standup.id === item.refId) ?? null,
        project: subs.find((s) => s.id === item.refId) ?? null,
        reactions: REACTIONS.map((emoji) => ({ emoji, count: mine.filter((r) => r.emoji === emoji).length, mine: mine.some((r) => r.emoji === emoji && r.userId === a.user.id) })),
        comments: comments
          .filter((c) => c.comment.feedItemId === item.id)
          .map((c) => ({ ...c.comment, author: c.author, canDelete: c.comment.userId === a.user.id || spaceRules.canModerate(a.spaceRole) })),
      };
    }),
  };
}

async function feedItemInSpace(a: MemberAccess, feedItemId: string) {
  const [row] = await db.select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.id, feedItemId), eq(feedItems.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Post not found");
  return row;
}

export async function toggleReaction(a: MemberAccess, feedItemId: string, emoji: string) {
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw fail.badRequest("Unknown reaction.");
  await feedItemInSpace(a, feedItemId);
  const where = and(eq(feedReactions.feedItemId, feedItemId), eq(feedReactions.userId, a.user.id), eq(feedReactions.emoji, emoji));
  const removed = await db.delete(feedReactions).where(where).returning({ e: feedReactions.emoji });
  if (!removed.length) await db.insert(feedReactions).values({ feedItemId, userId: a.user.id, emoji }).onConflictDoNothing();
  return { on: !removed.length };
}

export async function addComment(a: MemberAccess, feedItemId: string, body: string) {
  const text = body.trim();
  if (!text) throw fail.badRequest("Write a comment.");
  if (text.length > 1000) throw fail.badRequest("Comments are limited to 1000 characters.");
  await feedItemInSpace(a, feedItemId);
  // Light spam guard: at most 10 comments a minute per person.
  const [recent] = await db
    .select({ n: count() })
    .from(feedComments)
    .where(and(eq(feedComments.userId, a.user.id), sql`${feedComments.createdAt} > now() - interval '1 minute'`));
  if (recent.n >= 10) throw fail.tooMany("Slow down a little before commenting again.");
  const [row] = await db.insert(feedComments).values({ feedItemId, userId: a.user.id, body: text }).returning({ id: feedComments.id });
  return row;
}

export async function deleteComment(a: MemberAccess, commentId: string) {
  const [row] = await db
    .select({ comment: feedComments })
    .from(feedComments)
    .innerJoin(feedItems, eq(feedItems.id, feedComments.feedItemId))
    .where(and(eq(feedComments.id, commentId), eq(feedItems.spaceId, a.space.id)))
    .limit(1);
  if (!row) throw fail.notFound("Comment not found");
  if (row.comment.userId !== a.user.id && !spaceRules.canModerate(a.spaceRole)) throw fail.forbidden();
  await db.delete(feedComments).where(eq(feedComments.id, commentId));
}

/* ── Leaderboard (snapshots only) ─────────────────────────────────── */

/** The latest published board. Never reads the live ledger (twice-daily rule). */
export async function getLeaderboard(spaceId: string) {
  const [latest] = await db.select({ takenAt: leaderboardSnapshots.takenAt }).from(leaderboardSnapshots).where(eq(leaderboardSnapshots.spaceId, spaceId)).orderBy(desc(leaderboardSnapshots.takenAt)).limit(1);
  if (!latest) return { takenAt: null, rows: [] };
  const rows = await db
    .select({ rank: leaderboardSnapshots.rank, points: leaderboardSnapshots.points, user: author })
    .from(leaderboardSnapshots)
    .innerJoin(users, eq(users.id, leaderboardSnapshots.userId))
    .where(and(eq(leaderboardSnapshots.spaceId, spaceId), eq(leaderboardSnapshots.takenAt, latest.takenAt)))
    .orderBy(asc(leaderboardSnapshots.rank), asc(users.name))
    .limit(100);
  return { takenAt: latest.takenAt, rows };
}

/** The caller's own total and rank from the latest snapshot (also used on the space home). */
export async function getStanding(spaceId: string, userId: string) {
  const [row] = await db
    .select({ points: leaderboardSnapshots.points, rank: leaderboardSnapshots.rank, takenAt: leaderboardSnapshots.takenAt })
    .from(leaderboardSnapshots)
    .where(and(eq(leaderboardSnapshots.spaceId, spaceId), eq(leaderboardSnapshots.userId, userId)))
    .orderBy(desc(leaderboardSnapshots.takenAt))
    .limit(1);
  return row ?? null;
}
