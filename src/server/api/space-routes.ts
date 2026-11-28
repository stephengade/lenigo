import "server-only";
import { Elysia, t } from "elysia";
import { authMacro } from "@/server/api/auth-macro";
import { requireSpaceRole } from "@/server/auth/access";
import type { User } from "@/server/db/schema";
import * as curriculum from "@/server/services/curriculum";
import * as learning from "@/server/services/learning";
import * as placement from "@/server/services/placement";
import * as review from "@/server/services/review";
import * as social from "@/server/services/social";
import * as workshops from "@/server/services/workshops";

/**
 * Learning, accountability and workshop routes: /api/c/:community/:space/…
 * Every handler resolves the caller's membership from the URL slugs first; services then
 * re-check the role for the action and that every id belongs to that space.
 */
const S = "/c/:community/:space";
const Slug = t.String({ pattern: "^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$" });
const Id = t.String({ format: "uuid", error: "Invalid id." });
const P = t.Object({ community: Slug, space: Slug });
const PId = t.Object({ community: Slug, space: Slug, id: Id });
const Text = (max: number, min = 0) => t.String({ maxLength: max, minLength: min });
const Opt = (max: number) => t.Optional(t.Union([t.String({ maxLength: max }), t.Null()]));
const Direction = t.Object({ direction: t.Union([t.Literal("up"), t.Literal("down")]) });
const Tier = t.Union([t.Literal("BEGINNER"), t.Literal("INTERMEDIATE"), t.Literal("ADVANCED")]);
const Answers = t.Array(t.Integer({ minimum: 0, maximum: 9 }), { maxItems: 60 });
const Question = t.Object({
  prompt: Text(1000, 1),
  codeSnippet: Opt(4000),
  options: t.Array(Text(300), { minItems: 2, maxItems: 6 }),
  correctOptionIndex: t.Integer({ minimum: 0, maximum: 5 }),
  explanation: Opt(1000),
});
const PlacementQuestion = t.Object({ ...Question.properties, branchId: t.Optional(t.Union([Id, t.Null()])) });

const member = (user: User, params: { community: string; space: string }) => requireSpaceRole(user, params.community, params.space);

export const spaceRoutes = new Elysia()
  .use(authMacro)

  /* ── Curriculum builder (Leads and Managers; checked in the service) ── */
  .post(`${S}/tracks`, async ({ user, params, body }) => ({ id: (await curriculum.createTrack(await member(user, params), body)).id }), {
    auth: true,
    params: P,
    body: t.Object({ title: Text(80, 2), description: Opt(500) }),
  })
  .patch(
    `${S}/tracks/:id`,
    async ({ user, params, body }) => {
      await curriculum.updateTrack(await member(user, params), params.id, body);
      return { ok: true };
    },
    {
      auth: true,
      params: PId,
      body: t.Object({
        title: t.Optional(Text(80)),
        description: Opt(500),
        isPublished: t.Optional(t.Boolean()),
        prerequisiteTrackId: t.Optional(t.Union([Id, t.Null()])),
        prerequisiteTier: t.Optional(t.Union([Tier, t.Null()])),
        placementTaskMd: Opt(8000),
      }),
    },
  )
  .delete(`${S}/tracks/:id`, async ({ user, params }) => (await curriculum.deleteTrack(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/tracks/:id/move`, async ({ user, params, body }) => (await curriculum.moveTrack(await member(user, params), params.id, body.direction), { ok: true }), {
    auth: true,
    params: PId,
    body: Direction,
  })
  .patch(`${S}/levels/:id`, async ({ user, params, body }) => (await curriculum.updateLevel(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ title: t.Optional(Text(60)), isPublished: t.Optional(t.Boolean()) }),
  })
  .post(`${S}/levels/:id/branches`, async ({ user, params, body }) => ({ id: (await curriculum.createBranch(await member(user, params), params.id, body)).id }), {
    auth: true,
    params: PId,
    body: t.Object({ title: Text(60, 2), description: Opt(300) }),
  })
  .patch(`${S}/branches/:id`, async ({ user, params, body }) => (await curriculum.updateBranch(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ title: t.Optional(Text(60)), description: Opt(300) }),
  })
  .delete(`${S}/branches/:id`, async ({ user, params }) => (await curriculum.deleteBranch(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/levels/:id/modules`, async ({ user, params, body }) => ({ id: (await curriculum.createModule(await member(user, params), params.id, body)).id }), {
    auth: true,
    params: PId,
    body: t.Object({ title: Text(100, 2), summary: Opt(500), branchId: t.Optional(t.Union([Id, t.Null()])) }),
  })
  .patch(`${S}/modules/:id`, async ({ user, params, body }) => (await curriculum.updateModule(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({
      title: t.Optional(Text(100)),
      summary: Opt(500),
      projectBriefMd: Opt(10000),
      branchId: t.Optional(t.Union([Id, t.Null()])),
      isPublished: t.Optional(t.Boolean()),
    }),
  })
  .delete(`${S}/modules/:id`, async ({ user, params }) => (await curriculum.deleteModule(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/modules/:id/move`, async ({ user, params, body }) => (await curriculum.moveModule(await member(user, params), params.id, body.direction), { ok: true }), {
    auth: true,
    params: PId,
    body: Direction,
  })
  .post(`${S}/modules/:id/resources`, async ({ user, params, body }) => ({ id: (await curriculum.addResource(await member(user, params), params.id, body)).id }), {
    auth: true,
    params: PId,
    body: t.Object({
      type: t.Union([t.Literal("VIDEO"), t.Literal("ARTICLE")]),
      title: Text(160, 2),
      url: Text(2000, 1),
      sourceName: Opt(80),
      minutes: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 600 }), t.Null()])),
    }),
  })
  .delete(`${S}/resources/:id`, async ({ user, params }) => (await curriculum.deleteResource(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/resources/:id/move`, async ({ user, params, body }) => (await curriculum.moveResource(await member(user, params), params.id, body.direction), { ok: true }), {
    auth: true,
    params: PId,
    body: Direction,
  })
  .post(`${S}/modules/:id/checkpoints`, async ({ user, params, body }) => ({ id: (await curriculum.addCheckpoint(await member(user, params), params.id, body)).id }), {
    auth: true,
    params: PId,
    body: t.Object({ title: Text(120, 2), afterResourceId: t.Optional(t.Union([Id, t.Null()])), passThreshold: t.Optional(t.Integer({ minimum: 50, maximum: 100 })) }),
  })
  .delete(`${S}/checkpoints/:id`, async ({ user, params }) => (await curriculum.deleteCheckpoint(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/checkpoints/:id/questions`, async ({ user, params, body }) => curriculum.addQuestion(await member(user, params), params.id, body), { auth: true, params: PId, body: Question })
  .delete(`${S}/questions/:id`, async ({ user, params }) => (await curriculum.deleteQuestion(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/tracks/:id/placement-questions`, async ({ user, params, body }) => curriculum.addPlacementQuestion(await member(user, params), params.id, body), {
    auth: true,
    params: PId,
    body: PlacementQuestion,
  })
  .delete(`${S}/placement-questions/:id`, async ({ user, params }) => (await curriculum.retirePlacementQuestion(await member(user, params), params.id), { ok: true }), {
    auth: true,
    params: PId,
  })

  /* ── Joining a track, learning, promotions ─────────────────────── */
  .post(`${S}/onboarding`, async ({ user, params, body }) => learning.completeOnboarding(await member(user, params), body), {
    auth: true,
    params: P,
    body: t.Object({
      goalTrackId: Id,
      stack: t.Optional(t.Union([Text(100, 1), t.Null()])),
      experience: Text(2000, 1),
      links: t.Array(Text(300), { maxItems: 5 }),
      hoursPerWeek: t.Integer({ minimum: 1, maximum: 80, error: "Hours per week must be between 1 and 80." }),
    }),
  })
  .post(`${S}/resources/:id/heartbeat`, async ({ user, params, body }) => learning.recordHeartbeat(await member(user, params), params.id, body), {
    auth: true,
    params: PId,
    body: t.Object({ position: t.Number({ minimum: 0, maximum: 86400 }), playing: t.Boolean(), rate: t.Optional(t.Number({ minimum: 0.25, maximum: 4 })) }),
  })
  .post(`${S}/checkpoints/:id/attempts`, async ({ user, params, body }) => learning.submitCheckpoint(await member(user, params), params.id, body.answers), {
    auth: true,
    params: PId,
    body: t.Object({ answers: Answers }),
  })
  .post(`${S}/modules/:id/submissions`, async ({ user, params, body }) => learning.submitProject(await member(user, params), params.id, body), {
    auth: true,
    params: PId,
    body: t.Object({ repoUrl: Text(500, 1), liveUrl: Opt(500), notes: Opt(2000) }),
  })
  .post(`${S}/enrollments`, async ({ user, params, body }) => learning.enrolLearner(await member(user, params), body), {
    auth: true,
    params: P,
    body: t.Object({ userId: Id, trackId: Id, note: Opt(300) }),
  })
  .post(`${S}/enrollments/:id/branch`, async ({ user, params, body }) => (await learning.chooseBranch(await member(user, params), params.id, body.branchId), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ branchId: Id }),
  })
  .post(`${S}/enrollments/:id/promote`, async ({ user, params, body }) => learning.promoteLearner(await member(user, params), params.id, body), {
    auth: true,
    params: PId,
    body: t.Object({ reason: Text(500, 1), placementAttemptId: t.Optional(t.Union([Id, t.Null()])) }),
  })

  /* ── Placement test ────────────────────────────────────────────── */
  .post(`${S}/tracks/:id/placement`, async ({ user, params }) => placement.startPlacement(await member(user, params), params.id), { auth: true, params: PId })
  .post(`${S}/placement/:id/quiz`, async ({ user, params, body }) => placement.submitPlacementQuiz(await member(user, params), params.id, body.answers), {
    auth: true,
    params: PId,
    body: t.Object({ answers: Answers }),
  })
  .post(`${S}/placement/:id/task`, async ({ user, params, body }) => (await placement.submitPlacementTask(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ repoUrl: Text(500, 1), liveUrl: Opt(500) }),
  })
  .post(`${S}/placement/:id/review`, async ({ user, params, body }) => (await placement.reviewPlacement(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ decision: t.Union([t.Literal("RECOMMENDED"), t.Literal("NOT_RECOMMENDED")]), feedback: Text(2000, 1) }),
  })

  /* ── Mentor review ─────────────────────────────────────────────── */
  .post(`${S}/submissions/:id/review`, async ({ user, params, body }) => (await review.reviewSubmission(await member(user, params), params.id, body), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({
      decision: t.Union([t.Literal("APPROVED"), t.Literal("NEEDS_REVISION")]),
      score: t.Optional(t.Union([t.Integer({ minimum: 0, maximum: 100 }), t.Null()])),
      feedback: Text(4000, 1),
    }),
  })

  /* ── Standups and feed ─────────────────────────────────────────── */
  .post(`${S}/standups`, async ({ user, params, body }) => social.postStandup(await member(user, params), body), {
    auth: true,
    params: P,
    body: t.Object({ didToday: Text(1500, 1), nextStep: Text(600, 1), blockers: Opt(600), moduleId: t.Optional(t.Union([Id, t.Null()])) }),
  })
  .get(
    `${S}/feed`,
    async ({ user, params, query }) =>
      social.listFeed(await member(user, params), { before: query.before ? new Date(query.before) : null, helpOnly: query.help === "1" }),
    { auth: true, params: P, query: t.Object({ before: t.Optional(t.String({ format: "date-time" })), help: t.Optional(t.String({ maxLength: 1 })) }) },
  )
  .post(`${S}/feed/:id/reactions`, async ({ user, params, body }) => social.toggleReaction(await member(user, params), params.id, body.emoji), {
    auth: true,
    params: PId,
    body: t.Object({ emoji: Text(8, 1) }),
  })
  .post(`${S}/feed/:id/comments`, async ({ user, params, body }) => social.addComment(await member(user, params), params.id, body.body), {
    auth: true,
    params: PId,
    body: t.Object({ body: Text(1000, 1) }),
  })
  .delete(`${S}/comments/:id`, async ({ user, params }) => (await social.deleteComment(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })

  /* ── Workshops and live reviews ────────────────────────────────── */
  .post(`${S}/workshops`, async ({ user, params, body }) => workshops.createWorkshop(await member(user, params), body), {
    auth: true,
    params: P,
    body: t.Object({
      title: Text(120, 1),
      kind: t.Union([t.Literal("WORKSHOP"), t.Literal("STANDUP_REVIEW")]),
      type: t.Union([t.Literal("ONLINE_CALL"), t.Literal("PHYSICAL")]),
      startsAt: t.String({ format: "date-time", error: "Pick a start time." }),
      endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
      meetingUrl: Opt(500),
      venue: Opt(200),
      agendaMd: Opt(4000),
    }),
  })
  .delete(`${S}/workshops/:id`, async ({ user, params }) => (await workshops.cancelWorkshop(await member(user, params), params.id), { ok: true }), { auth: true, params: PId })
  .post(`${S}/workshops/:id/rsvp`, async ({ user, params, body }) => workshops.rsvp(await member(user, params), params.id, body), {
    auth: true,
    params: PId,
    body: t.Object({ going: t.Boolean(), submissionId: t.Optional(t.Union([Id, t.Null()])) }),
  })
  .post(`${S}/workshops/:id/attendance`, async ({ user, params, body }) => (await workshops.markAttendance(await member(user, params), params.id, body.userId), { ok: true }), {
    auth: true,
    params: PId,
    body: t.Object({ userId: Id }),
  });
