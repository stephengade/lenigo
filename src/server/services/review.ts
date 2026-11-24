import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  enrollmentBranches,
  feedItems,
  levelPromotions,
  levels,
  modules,
  placementAttempts,
  spaceIntakes,
  spaceMembers,
  standups,
  streaks,
  submissionReviews,
  submissions,
  trackEnrollments,
  tracks,
  users,
} from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { logActivity } from "@/server/activity";
import { awardPoints } from "@/server/points/rules";
import { level as levelRules, space as spaceRules } from "@/lib/permissions";
import { liveStreak, localDate } from "@/lib/dates";

const learner = { id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, githubUsername: users.githubUsername };

/* ── Review queue ─────────────────────────────────────────────────── */

export async function getReviewQueue(a: MemberAccess) {
  if (!spaceRules.canReview(a.spaceRole)) throw fail.forbidden();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [pending, placements, recent, turnaround] = await Promise.all([
    db
      .select({ submission: submissions, module: { id: modules.id, title: modules.title, projectBriefMd: modules.projectBriefMd }, track: tracks.title, learner })
      .from(submissions)
      .innerJoin(modules, eq(modules.id, submissions.moduleId))
      .innerJoin(levels, eq(levels.id, modules.levelId))
      .innerJoin(tracks, eq(tracks.id, levels.trackId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(and(eq(submissions.spaceId, a.space.id), eq(submissions.status, "PENDING")))
      .orderBy(asc(submissions.createdAt)),
    db
      .select({ attempt: placementAttempts, track: tracks.title, learner })
      .from(placementAttempts)
      .innerJoin(tracks, eq(tracks.id, placementAttempts.trackId))
      .innerJoin(users, eq(users.id, placementAttempts.userId))
      .where(and(eq(placementAttempts.spaceId, a.space.id), inArray(placementAttempts.status, ["AWAITING_REVIEW", "RECOMMENDED"])))
      .orderBy(asc(placementAttempts.submittedAt)),
    db
      .select({ review: submissionReviews, module: modules.title, learner })
      .from(submissionReviews)
      .innerJoin(submissions, eq(submissions.id, submissionReviews.submissionId))
      .innerJoin(modules, eq(modules.id, submissions.moduleId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(eq(submissionReviews.spaceId, a.space.id))
      .orderBy(desc(submissionReviews.createdAt))
      .limit(10),
    db
      .select({
        hours: sql<number | null>`avg(extract(epoch from (${submissions.reviewedAt} - ${submissions.createdAt})) / 3600)`.mapWith((v) => (v == null ? null : Number(v))),
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(submissions)
      .where(and(eq(submissions.spaceId, a.space.id), isNotNull(submissions.reviewedAt), gte(submissions.reviewedAt, since))),
  ]);

  // A placement already turned into a promotion no longer needs anyone.
  const recommended = placements.filter((p) => p.attempt.status === "RECOMMENDED");
  const promotedVia = recommended.length
    ? await db
        .select({ id: levelPromotions.placementAttemptId })
        .from(levelPromotions)
        .where(inArray(levelPromotions.placementAttemptId, recommended.map((p) => p.attempt.id)))
    : [];
  const done = new Set(promotedVia.map((r) => r.id));
  const enrollmentsFor = recommended.length
    ? await db
        .select({ id: trackEnrollments.id, userId: trackEnrollments.userId, trackId: trackEnrollments.trackId, tier: trackEnrollments.tier })
        .from(trackEnrollments)
        .where(and(eq(trackEnrollments.spaceId, a.space.id), inArray(trackEnrollments.userId, recommended.map((p) => p.attempt.userId))))
    : [];

  return {
    pending: pending.map((p) => ({ ...p, mine: p.submission.userId === a.user.id })),
    placementsToReview: placements.filter((p) => p.attempt.status === "AWAITING_REVIEW").map((p) => ({ ...p, mine: p.attempt.userId === a.user.id })),
    placementsToPromote: recommended
      .filter((p) => !done.has(p.attempt.id))
      .map((p) => ({
        ...p,
        enrollment: enrollmentsFor.find((e) => e.userId === p.attempt.userId && e.trackId === p.attempt.trackId && e.tier === "BEGINNER") ?? null,
      }))
      .filter((p) => p.enrollment),
    recent,
    turnaround: turnaround[0] ?? { hours: null, n: 0 },
  };
}

/** Approve and score, or ask for changes. Mentors and above, never their own (also DB-enforced). */
export async function reviewSubmission(
  a: MemberAccess,
  submissionId: string,
  input: { decision: "APPROVED" | "NEEDS_REVISION"; score?: number | null; feedback: string },
) {
  if (!spaceRules.canScoreSubmissions(a.spaceRole)) throw fail.forbidden();
  const [row] = await db
    .select({ submission: submissions, module: modules, level: levels })
    .from(submissions)
    .innerJoin(modules, eq(modules.id, submissions.moduleId))
    .innerJoin(levels, eq(levels.id, modules.levelId))
    .where(and(eq(submissions.id, submissionId), eq(submissions.spaceId, a.space.id)))
    .limit(1);
  if (!row) throw fail.notFound("Submission not found");
  const s = row.submission;
  if (s.userId === a.user.id) throw fail.forbidden("You can't review your own project.");
  if (s.status !== "PENDING") throw fail.conflict("This project has already been reviewed.");
  const feedback = input.feedback.trim();
  if (feedback.length < 10) throw fail.badRequest("Write feedback the learner can act on (at least 10 characters).");
  const score = input.decision === "APPROVED" ? Math.round(input.score ?? NaN) : null;
  if (input.decision === "APPROVED" && (!Number.isFinite(score) || score! < 0 || score! > 100)) throw fail.badRequest("Score the project from 0 to 100.");

  // Placed-out content earns no points: find the level the learner placed into, if any.
  const [enrollment] = await db.select().from(trackEnrollments).where(and(eq(trackEnrollments.trackId, row.level.trackId), eq(trackEnrollments.userId, s.userId))).limit(1);
  const [placed] = enrollment
    ? await db
        .select({ toLevel: levelPromotions.toLevel })
        .from(levelPromotions)
        .where(and(eq(levelPromotions.enrollmentId, enrollment.id), isNotNull(levelPromotions.placementAttemptId)))
        .orderBy(desc(levelPromotions.createdAt))
        .limit(1)
    : [];
  const placedOut = levelRules.isPlacedOut(row.level.tier, placed?.toLevel ?? null);

  await db.transaction(async (tx) => {
    await tx.insert(submissionReviews).values({ submissionId: s.id, spaceId: a.space.id, reviewerId: a.user.id, decision: input.decision, score, feedback });
    const updated = await tx
      .update(submissions)
      .set({ status: input.decision, score, mentorFeedback: feedback, reviewedById: a.user.id, reviewedAt: new Date() })
      .where(and(eq(submissions.id, s.id), eq(submissions.status, "PENDING")))
      .returning({ id: submissions.id });
    if (!updated.length) throw fail.conflict("Someone else reviewed this project a moment ago.");
    if (input.decision === "APPROVED") {
      if (!placedOut) {
        await awardPoints(
          { spaceId: a.space.id, communityId: a.community.id, userId: s.userId, reason: "PROJECT_APPROVED", dedupeKey: `project:${s.moduleId}`, refId: s.id, trackId: row.level.trackId, score },
          tx,
        );
      }
      await tx.insert(feedItems).values({ spaceId: a.space.id, actorUserId: s.userId, kind: "PROJECT_APPROVED", refId: s.id, meta: { module: row.module.title } });
    }
    await logActivity(
      {
        actorUserId: a.user.id,
        actionType: input.decision === "APPROVED" ? "SUBMISSION_APPROVED" : "SUBMISSION_NEEDS_REVISION",
        communityId: a.community.id,
        spaceId: a.space.id,
        entityType: "submission",
        entityId: s.id,
        metadata: { learner: s.userId, module: row.module.title, score },
      },
      tx,
    );
  });
}

/* ── Learners overview (Mentors and above) ────────────────────────── */

export async function listLearners(a: MemberAccess) {
  if (!spaceRules.canReview(a.spaceRole)) throw fail.forbidden();
  const today = localDate(a.community.timezone);
  const members = await db
    .select({ ...learner, joinedAt: spaceMembers.joinedAt })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(and(eq(spaceMembers.spaceId, a.space.id), eq(spaceMembers.role, "MEMBER")))
    .orderBy(asc(users.name));
  if (!members.length) return { learners: [], tracks: [] };

  const [enr, lv, mods, chosen, approved, intakes, st, last, trackRows, openPlacements] = await Promise.all([
    db.select().from(trackEnrollments).where(eq(trackEnrollments.spaceId, a.space.id)),
    db.select().from(levels).where(eq(levels.spaceId, a.space.id)),
    db.select({ id: modules.id, levelId: modules.levelId, branchId: modules.branchId }).from(modules).where(and(eq(modules.spaceId, a.space.id), eq(modules.isPublished, true))),
    db.select().from(enrollmentBranches).innerJoin(trackEnrollments, eq(trackEnrollments.id, enrollmentBranches.enrollmentId)).where(eq(trackEnrollments.spaceId, a.space.id)),
    db.selectDistinct({ userId: submissions.userId, moduleId: submissions.moduleId }).from(submissions).where(and(eq(submissions.spaceId, a.space.id), eq(submissions.status, "APPROVED"))),
    db.select().from(spaceIntakes).where(eq(spaceIntakes.spaceId, a.space.id)),
    db.select().from(streaks).where(eq(streaks.spaceId, a.space.id)),
    db.select({ userId: standups.userId, last: sql<string>`max(${standups.localDate})` }).from(standups).where(eq(standups.spaceId, a.space.id)).groupBy(standups.userId),
    db.select({ id: tracks.id, title: tracks.title, isPublished: tracks.isPublished }).from(tracks).where(eq(tracks.spaceId, a.space.id)).orderBy(asc(tracks.position)),
    db.select({ userId: placementAttempts.userId, status: placementAttempts.status }).from(placementAttempts).where(and(eq(placementAttempts.spaceId, a.space.id), inArray(placementAttempts.status, ["AWAITING_REVIEW", "RECOMMENDED"]))),
  ]);
  const done = new Set(approved.map((r) => `${r.userId}:${r.moduleId}`));

  return {
    tracks: trackRows,
    learners: members.map((m) => {
      const mine = enr.filter((e) => e.userId === m.id);
      const streak = st.find((s) => s.userId === m.id);
      return {
        ...m,
        intake: intakes.find((i) => i.userId === m.id) ?? null,
        streak: streak ? liveStreak(streak.current, streak.lastActiveDate, today) : 0,
        lastStandup: last.find((l) => l.userId === m.id)?.last ?? null,
        placement: openPlacements.find((p) => p.userId === m.id)?.status ?? null,
        enrollments: mine.map((e) => {
          const trackLevels = lv.filter((l) => l.trackId === e.trackId);
          const cur = trackLevels.find((l) => l.tier === e.tier);
          const branchId = chosen.find((c) => c.enrollment_branches.enrollmentId === e.id && c.enrollment_branches.levelId === cur?.id)?.enrollment_branches.branchId ?? null;
          const path = cur ? mods.filter((md) => md.levelId === cur.id && (!md.branchId || md.branchId === branchId)) : [];
          const complete = path.filter((md) => done.has(`${m.id}:${md.id}`)).length;
          const next = levelRules.next(e.tier);
          return {
            id: e.id,
            trackId: e.trackId,
            track: trackRows.find((t) => t.id === e.trackId)?.title ?? "Track",
            tier: e.tier,
            levelTitle: cur?.title ?? e.tier,
            nextLevelTitle: next ? (trackLevels.find((l) => l.tier === next)?.title ?? next) : null,
            modules: path.length,
            complete,
            ready: !!next && path.length > 0 && complete === path.length && !!cur?.isPublished,
          };
        }),
      };
    }),
  };
}
