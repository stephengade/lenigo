import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { placementAttempts, placementQuestions, trackEnrollments, tracks, users } from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { logActivity } from "@/server/activity";
import { afterResponse, notifyPlacementReviewed } from "@/server/services/notifications";
import { PLACEMENT } from "@/lib/placement";
import { space as spaceRules } from "@/lib/permissions";

/** Fewest questions a bank needs before the test is offered. */
export const MIN_BANK = 5;
/** Grace for network lag when the timer runs out. */
const GRACE_MS = 30_000;

const httpsUrl = (raw: string | null | undefined, label: string) => {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw fail.badRequest(`${label} must be an https link.`);
  }
};

/** What the learner may do about a placement test in one track. */
export async function placementOffer(spaceId: string, trackId: string, userId: string) {
  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.spaceId, spaceId))).limit(1);
  if (!track?.placementTaskMd) return { offered: false as const };
  const bank = await db.select({ id: placementQuestions.id }).from(placementQuestions).where(and(eq(placementQuestions.trackId, trackId), eq(placementQuestions.isActive, true)));
  if (bank.length < MIN_BANK) return { offered: false as const };
  const [latest] = await db.select().from(placementAttempts).where(and(eq(placementAttempts.trackId, trackId), eq(placementAttempts.userId, userId))).orderBy(desc(placementAttempts.startedAt)).limit(1);
  const retakeAt = latest ? new Date(latest.startedAt.getTime() + PLACEMENT.retakeAfterDays * 86_400_000) : null;
  return { offered: true as const, latest: latest ?? null, canStart: !latest || retakeAt! <= new Date(), retakeAt };
}

export async function startPlacement(a: MemberAccess, trackId: string) {
  const [enrollment] = await db.select().from(trackEnrollments).where(and(eq(trackEnrollments.trackId, trackId), eq(trackEnrollments.userId, a.user.id), eq(trackEnrollments.spaceId, a.space.id))).limit(1);
  if (!enrollment) throw fail.forbidden("Join this track first.");
  if (enrollment.tier !== "BEGINNER") throw fail.conflict("The placement test is for learners at the first level.");
  const offer = await placementOffer(a.space.id, trackId, a.user.id);
  if (!offer.offered) throw fail.conflict("This track doesn't offer a placement test.");
  if (!offer.canStart) throw fail.tooMany(`You can take the test again on ${offer.retakeAt!.toDateString()}.`);

  const bank = await db.select({ id: placementQuestions.id }).from(placementQuestions).where(and(eq(placementQuestions.trackId, trackId), eq(placementQuestions.isActive, true)));
  // Fisher–Yates with crypto randomness: the draw can't be predicted.
  const ids = bank.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const questionIds = ids.slice(0, PLACEMENT.quizQuestions);
  const [row] = await db
    .insert(placementAttempts)
    .values({
      trackId,
      spaceId: a.space.id,
      communityId: a.community.id,
      userId: a.user.id,
      questionIds,
      quizDeadlineAt: new Date(Date.now() + PLACEMENT.quizMinutes * 60_000),
    })
    .returning({ id: placementAttempts.id });
  return row;
}

async function attemptInSpace(a: MemberAccess, attemptId: string) {
  const [row] = await db.select().from(placementAttempts).where(and(eq(placementAttempts.id, attemptId), eq(placementAttempts.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Placement test not found");
  return row;
}

/** The learner's own attempt, or any attempt for staff who review placements. Answer keys are never included. */
export async function getPlacementAttempt(a: MemberAccess, attemptId: string) {
  const att = await attemptInSpace(a, attemptId);
  const staff = spaceRules.canReviewPlacement(a.spaceRole) && att.userId !== a.user.id;
  if (att.userId !== a.user.id && !staff) throw fail.notFound("Placement test not found");

  // A quiz past its deadline ends as EXPIRED the next time anyone looks at it.
  if (att.status === "QUIZ" && att.quizDeadlineAt.getTime() + GRACE_MS < Date.now()) {
    await db.update(placementAttempts).set({ status: "EXPIRED" }).where(and(eq(placementAttempts.id, att.id), eq(placementAttempts.status, "QUIZ")));
    att.status = "EXPIRED";
  }
  const [track] = await db.select().from(tracks).where(eq(tracks.id, att.trackId)).limit(1);
  const [learner] = await db.select({ name: users.name, email: users.email, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, att.userId)).limit(1);
  const qs = att.status === "QUIZ" && !staff ? await db.select().from(placementQuestions).where(inArray(placementQuestions.id, att.questionIds)) : [];
  return {
    attempt: att,
    track: { id: track.id, title: track.title, placementTaskMd: track.placementTaskMd },
    learner,
    isOwner: att.userId === a.user.id,
    questions: att.questionIds
      .map((id) => qs.find((q) => q.id === id))
      .filter((q) => !!q)
      .map((q) => ({ id: q.id, prompt: q.prompt, codeSnippet: q.codeSnippet, options: q.options })),
  };
}

export async function submitPlacementQuiz(a: MemberAccess, attemptId: string, answers: number[]) {
  const att = await attemptInSpace(a, attemptId);
  if (att.userId !== a.user.id) throw fail.notFound("Placement test not found");
  if (att.status !== "QUIZ") throw fail.conflict("The quiz part of this test is over.");
  if (att.quizDeadlineAt.getTime() + GRACE_MS < Date.now()) {
    await db.update(placementAttempts).set({ status: "EXPIRED" }).where(eq(placementAttempts.id, att.id));
    throw fail.gone("Time ran out on this quiz.");
  }
  if (answers.length !== att.questionIds.length) throw fail.badRequest("Answer every question (pick your best guess).");
  const qs = await db.select().from(placementQuestions).where(inArray(placementQuestions.id, att.questionIds));
  // A question retired mid-test counts as correct, so a curator's edit can't fail a learner.
  const correct = att.questionIds.reduce((n, id, i) => {
    const q = qs.find((x) => x.id === id);
    return n + (!q || !q.isActive || q.correctOptionIndex === answers[i] ? 1 : 0);
  }, 0);
  const scorePct = Math.round((correct / att.questionIds.length) * 100);
  const passed = scorePct >= PLACEMENT.quizPassPct;
  // Below the mark the attempt ends here (EXPIRED keeps the score); at or above it the task opens.
  await db
    .update(placementAttempts)
    .set({ answers, quizScorePct: scorePct, status: passed ? "TASK" : "EXPIRED" })
    .where(and(eq(placementAttempts.id, att.id), eq(placementAttempts.status, "QUIZ")));
  return { scorePct, passed, passPct: PLACEMENT.quizPassPct };
}

export async function submitPlacementTask(a: MemberAccess, attemptId: string, input: { repoUrl: string; liveUrl?: string | null }) {
  const att = await attemptInSpace(a, attemptId);
  if (att.userId !== a.user.id) throw fail.notFound("Placement test not found");
  if (att.status !== "TASK") throw fail.conflict("This test isn't waiting for the practical task.");
  const repoUrl = httpsUrl(input.repoUrl, "Repository link");
  if (!repoUrl) throw fail.badRequest("Add the link to your code.");
  await db
    .update(placementAttempts)
    .set({ taskRepoUrl: repoUrl, taskLiveUrl: httpsUrl(input.liveUrl, "Live link"), status: "AWAITING_REVIEW", submittedAt: new Date() })
    .where(and(eq(placementAttempts.id, att.id), eq(placementAttempts.status, "TASK")));
  await logActivity({ actorUserId: a.user.id, actionType: "PLACEMENT_SUBMITTED", communityId: a.community.id, spaceId: a.space.id, entityType: "placement", entityId: att.id });
}

/** A Mentor or above recommends (or not). This never changes a level: a Mentor or Lead promotes afterwards. */
export async function reviewPlacement(a: MemberAccess, attemptId: string, input: { decision: "RECOMMENDED" | "NOT_RECOMMENDED"; feedback: string }) {
  if (!spaceRules.canReviewPlacement(a.spaceRole)) throw fail.forbidden();
  const att = await attemptInSpace(a, attemptId);
  if (att.userId === a.user.id) throw fail.forbidden("You can't review your own placement test.");
  if (att.status !== "AWAITING_REVIEW") throw fail.conflict("This test isn't waiting for review.");
  const feedback = input.feedback.trim();
  if (feedback.length < 10) throw fail.badRequest("Write feedback the learner can act on.");
  await db
    .update(placementAttempts)
    .set({ status: input.decision, reviewerId: a.user.id, reviewFeedback: feedback, reviewedAt: new Date() })
    .where(and(eq(placementAttempts.id, att.id), eq(placementAttempts.status, "AWAITING_REVIEW")));
  await logActivity({
    actorUserId: a.user.id,
    actionType: "PLACEMENT_REVIEWED",
    communityId: a.community.id,
    spaceId: a.space.id,
    entityType: "placement",
    entityId: att.id,
    metadata: { decision: input.decision, learner: att.userId },
  });
  await afterResponse(() => notifyPlacementReviewed(att.id));
}
