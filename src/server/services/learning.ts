import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  checkpoints,
  enrollmentBranches,
  feedItems,
  levelPromotions,
  levels,
  modules,
  placementAttempts,
  quizAttempts,
  quizQuestions,
  resourceProgress,
  resources,
  spaceIntakes,
  spaceMembers,
  submissionReviews,
  submissions,
  trackBranches,
  trackEnrollments,
  tracks,
  users,
  type LevelTier,
  type TrackEnrollment,
} from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { parseHttpsUrl } from "@/lib/validate";
import { logActivity } from "@/server/activity";
import { afterResponse, notifyPromoted } from "@/server/services/notifications";
import { awardPoints } from "@/server/points/rules";
import { level as levelRules, LEVELS, space as spaceRules } from "@/lib/permissions";
import { trackingFor } from "@/lib/video";
import { buildModuleSteps, type ModuleStep } from "@/lib/module-steps";

/* ════════════════════════════ Progress model ════════════════════════════ */

export type ModuleNode = {
  id: string;
  /** URL name within the track: /learn/<track>/<slug>. */
  slug: string;
  title: string;
  summary: string | null;
  levelId: string;
  tier: LevelTier;
  branchId: string | null;
  videos: number;
  videosDone: number;
  checkpoints: number;
  checkpointsPassed: number;
  submission: { id: string; status: "PENDING" | "APPROVED" | "NEEDS_REVISION"; score: number | null } | null;
  complete: boolean;
  /** Below the level reached through a placement test: open, never gating, earns no points. */
  placedOut: boolean;
  locked: boolean;
  /** The module's pages in order (lessons, quizzes, project), for the roadmap's expandable rows. */
  steps: ModuleStep[];
};

export type LevelNode = {
  id: string;
  tier: LevelTier;
  title: string;
  /** At or below the learner's tier (or staff preview). Above it, modules are hidden. */
  reachable: boolean;
  branches: { id: string; title: string; description: string | null }[];
  chosenBranchId: string | null;
  /** Core is done but no branch is picked yet: the learner must choose to go on. */
  needsBranch: boolean;
  modules: ModuleNode[];
  hiddenModules: number;
  complete: boolean;
};

export type TrackProgress = {
  track: { id: string; slug: string; title: string; description: string | null; placementTaskMd: string | null };
  enrollment: TrackEnrollment | null;
  preview: boolean;
  placedInto: LevelTier | null;
  levels: LevelNode[];
  activeModuleId: string | null;
  /** The learner finished everything at their current level and a next level exists. */
  readyForPromotion: boolean;
  totals: { modules: number; complete: number };
};

const TRACKABLE = ["YOUTUBE", "GOOGLE_DRIVE"] as const;

/**
 * The single source of truth for "what can this learner open". Used to draw the roadmap
 * AND to authorise every progress write, so the UI and the server can't disagree.
 * preview = staff looking without an enrolment: everything published, nothing locked.
 */
export async function loadTrackProgress(opts: { trackId: string; userId: string; enrollment: TrackEnrollment | null; preview: boolean }): Promise<TrackProgress> {
  const { trackId, userId, enrollment, preview } = opts;
  const [track] = await db
    .select({ id: tracks.id, slug: tracks.slug, title: tracks.title, description: tracks.description, placementTaskMd: tracks.placementTaskMd })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!track) throw fail.notFound("Track not found");

  const lv = (await db.select().from(levels).where(and(eq(levels.trackId, trackId), eq(levels.isPublished, true)))).sort(
    (a, b) => LEVELS.indexOf(a.tier) - LEVELS.indexOf(b.tier),
  );
  const levelIds = lv.map((l) => l.id);
  const [mods, br, chosen, promo] = await Promise.all([
    levelIds.length
      ? db.select().from(modules).where(and(inArray(modules.levelId, levelIds), eq(modules.isPublished, true))).orderBy(asc(modules.position), asc(modules.createdAt))
      : Promise.resolve([]),
    db.select().from(trackBranches).where(eq(trackBranches.trackId, trackId)).orderBy(asc(trackBranches.position), asc(trackBranches.createdAt)),
    enrollment ? db.select().from(enrollmentBranches).where(eq(enrollmentBranches.enrollmentId, enrollment.id)) : Promise.resolve([]),
    enrollment
      ? db
          .select({ toLevel: levelPromotions.toLevel })
          .from(levelPromotions)
          .where(and(eq(levelPromotions.enrollmentId, enrollment.id), or(isNotNull(levelPromotions.placementAttemptId), eq(levelPromotions.viaInvite, true))))
          .orderBy(desc(levelPromotions.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const moduleIds = mods.map((m) => m.id);
  const [lessons, done, cps, passed, subs] = moduleIds.length
    ? await Promise.all([
        // Every published lesson, in module order: the counts use the tracked videos, the steps use all.
        db
          .select({ id: resources.id, moduleId: resources.moduleId, slug: resources.slug, title: resources.title, type: resources.type, provider: resources.provider })
          .from(resources)
          .where(and(inArray(resources.moduleId, moduleIds), eq(resources.isPublished, true)))
          .orderBy(asc(resources.position), asc(resources.createdAt)),
        db
          .select({ resourceId: resourceProgress.resourceId })
          .from(resourceProgress)
          .innerJoin(resources, eq(resources.id, resourceProgress.resourceId))
          .where(and(eq(resourceProgress.userId, userId), inArray(resources.moduleId, moduleIds), isNotNull(resourceProgress.completedAt))),
        db
          .select({ id: checkpoints.id, moduleId: checkpoints.moduleId, slug: checkpoints.slug, title: checkpoints.title, afterResourceId: checkpoints.afterResourceId })
          .from(checkpoints)
          .where(inArray(checkpoints.moduleId, moduleIds))
          .orderBy(asc(checkpoints.position), asc(checkpoints.createdAt)),
        db
          .selectDistinct({ checkpointId: quizAttempts.checkpointId })
          .from(quizAttempts)
          .where(and(eq(quizAttempts.userId, userId), inArray(quizAttempts.moduleId, moduleIds), eq(quizAttempts.passed, true))),
        db
          .select({ id: submissions.id, moduleId: submissions.moduleId, status: submissions.status, score: submissions.score })
          .from(submissions)
          .where(and(eq(submissions.userId, userId), inArray(submissions.moduleId, moduleIds)))
          .orderBy(desc(submissions.createdAt)),
      ])
    : [[], [], [], [], []];

  const doneSet = new Set(done.map((d) => d.resourceId));
  const passedSet = new Set(passed.map((p) => p.checkpointId));
  const placedInto = promo[0]?.toLevel ?? null;
  const tier = enrollment?.tier ?? "BEGINNER";

  let blocked = false;
  let activeModuleId: string | null = null;
  let total = 0;
  let completeCount = 0;

  const levelNodes: LevelNode[] = lv.map((l) => {
    const reachable = preview || levelRules.rank(l.tier) <= levelRules.rank(tier);
    const branches = br.filter((b) => b.levelId === l.id).map((b) => ({ id: b.id, title: b.title, description: b.description }));
    const chosenBranchId = chosen.find((c) => c.levelId === l.id)?.branchId ?? null;
    const inLevel = mods.filter((m) => m.levelId === l.id);
    const core = inLevel.filter((m) => !m.branchId);
    const branchMods = preview ? inLevel.filter((m) => m.branchId) : chosenBranchId ? inLevel.filter((m) => m.branchId === chosenBranchId) : [];
    const path = reachable ? [...core, ...branchMods] : [];

    const nodes = path.map((m): ModuleNode => {
      const ml = lessons.filter((r) => r.moduleId === m.id);
      const mv = ml.filter((r) => r.type === "VIDEO" && r.provider && (TRACKABLE as readonly string[]).includes(r.provider));
      const mc = cps.filter((c) => c.moduleId === m.id);
      const sub = subs.find((s) => s.moduleId === m.id) ?? null;
      const node: ModuleNode = {
        id: m.id,
        slug: m.slug,
        title: m.title,
        summary: m.summary,
        levelId: l.id,
        tier: l.tier,
        branchId: m.branchId,
        videos: mv.length,
        videosDone: mv.filter((v) => doneSet.has(v.id)).length,
        checkpoints: mc.length,
        checkpointsPassed: mc.filter((c) => passedSet.has(c.id)).length,
        submission: sub ? { id: sub.id, status: sub.status, score: sub.score } : null,
        complete: false,
        placedOut: !preview && levelRules.isPlacedOut(l.tier, placedInto),
        locked: !preview && blocked,
        steps: buildModuleSteps({
          resources: ml.map((r) => ({ ...r, completed: doneSet.has(r.id) })),
          checkpoints: mc.map((c) => ({ ...c, passed: passedSet.has(c.id) })),
          submissionStatus: sub?.status ?? null,
          preview,
        }),
      };
      node.complete = node.videosDone >= node.videos && node.checkpointsPassed >= node.checkpoints && sub?.status === "APPROVED";
      if (!node.placedOut) {
        total++;
        if (node.complete) completeCount++;
        if (!node.complete) {
          if (!node.locked && !activeModuleId) activeModuleId = node.id;
          blocked = true;
        }
      }
      return node;
    });

    const needsBranch = !preview && reachable && branches.length > 0 && !chosenBranchId;
    const placedOutLevel = !preview && levelRules.isPlacedOut(l.tier, placedInto);
    // A level with options isn't finished until one is picked (placed-out levels never gate).
    if (needsBranch && !placedOutLevel) blocked = true;
    const complete = reachable && !needsBranch && nodes.every((n) => n.complete || n.placedOut);
    return {
      id: l.id,
      tier: l.tier,
      title: l.title,
      reachable,
      branches,
      chosenBranchId,
      needsBranch,
      modules: nodes,
      hiddenModules: reachable ? 0 : inLevel.filter((m) => !m.branchId).length,
      complete,
    };
  });

  const current = levelNodes.find((l) => l.tier === tier);
  const next = levelRules.next(tier);
  const readyForPromotion =
    !!enrollment && !!current && current.complete && current.modules.length > 0 && !!next && levelNodes.some((l) => l.tier === next);

  return {
    track,
    enrollment,
    preview,
    placedInto,
    levels: levelNodes,
    activeModuleId,
    readyForPromotion,
    totals: { modules: total, complete: completeCount },
  };
}

/* ════════════════════════════ Enrolments ════════════════════════════ */

export async function getMyEnrollments(spaceId: string, userId: string) {
  return db
    .select({ enrollment: trackEnrollments, trackTitle: tracks.title, levelTitle: levels.title })
    .from(trackEnrollments)
    .innerJoin(tracks, eq(tracks.id, trackEnrollments.trackId))
    .leftJoin(levels, and(eq(levels.trackId, trackEnrollments.trackId), eq(levels.tier, trackEnrollments.tier)))
    .where(and(eq(trackEnrollments.spaceId, spaceId), eq(trackEnrollments.userId, userId)))
    .orderBy(asc(trackEnrollments.createdAt));
}

export async function getIntake(spaceId: string, userId: string) {
  const [row] = await db.select().from(spaceIntakes).where(and(eq(spaceIntakes.spaceId, spaceId), eq(spaceIntakes.userId, userId))).limit(1);
  return row ?? null;
}

/** Roadmap: every track the learner is in, with progress. Staff without an enrolment get a preview of `previewTrackId`. */
export async function getRoadmap(a: MemberAccess, previewTrackId?: string | null) {
  const mine = await getMyEnrollments(a.space.id, a.user.id);
  const progress = await Promise.all(
    mine.map((m) => loadTrackProgress({ trackId: m.enrollment.trackId, userId: a.user.id, enrollment: m.enrollment, preview: false })),
  );
  let preview: TrackProgress | null = null;
  if (previewTrackId && spaceRules.bypassesLocks(a.spaceRole) && !mine.some((m) => m.enrollment.trackId === previewTrackId)) {
    const [t] = await db.select({ id: tracks.id }).from(tracks).where(and(eq(tracks.id, previewTrackId), eq(tracks.spaceId, a.space.id))).limit(1);
    if (t) preview = await loadTrackProgress({ trackId: t.id, userId: a.user.id, enrollment: null, preview: true });
  }
  return { enrollments: mine, progress, preview };
}

const httpsList = (links: string[]) =>
  links
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => {
      const u = parseHttpsUrl(l);
      if (!u) throw fail.badRequest(`"${l.slice(0, 60)}" isn't a complete https link.`);
      return u;
    });

/* ── Stacks: one pick that holds across every level of a track ─────────── */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TrackStack = { slug: string; title: string; description: string | null };

/**
 * A track's stacks: its pick-one options (branches) matched across levels by slug, so
 * "Python (FastAPI)" in Beginner and in Intermediate is one choice. Only published levels count.
 */
export async function trackStacks(trackIds: string[]): Promise<Map<string, TrackStack[]>> {
  const out = new Map<string, TrackStack[]>();
  if (!trackIds.length) return out;
  const rows = await db
    .select({ trackId: trackBranches.trackId, slug: trackBranches.slug, title: trackBranches.title, description: trackBranches.description, tier: levels.tier, position: trackBranches.position })
    .from(trackBranches)
    .innerJoin(levels, eq(levels.id, trackBranches.levelId))
    .where(and(inArray(trackBranches.trackId, trackIds), eq(levels.isPublished, true)));
  rows.sort((x, y) => levelRules.rank(x.tier) - levelRules.rank(y.tier) || x.position - y.position);
  for (const r of rows) {
    const list = out.get(r.trackId) ?? [];
    if (!list.some((x) => x.slug === r.slug)) list.push({ slug: r.slug, title: r.title, description: r.description });
    out.set(r.trackId, list);
  }
  return out;
}

/** Whether the learner has any progress or a submission in a branch (they've "started" it). */
async function startedBranch(tx: Tx, userId: string, branchId: string) {
  const [p] = await tx
    .select({ id: resourceProgress.resourceId })
    .from(resourceProgress)
    .innerJoin(resources, eq(resources.id, resourceProgress.resourceId))
    .innerJoin(modules, eq(modules.id, resources.moduleId))
    .where(and(eq(resourceProgress.userId, userId), eq(modules.branchId, branchId)))
    .limit(1);
  if (p) return true;
  const [sub] = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(modules, eq(modules.id, submissions.moduleId))
    .where(and(eq(submissions.userId, userId), eq(modules.branchId, branchId)))
    .limit(1);
  return !!sub;
}

/**
 * Sets the learner's option to `slug` in every level of the track that offers it. A level
 * where they've already started a different option keeps it: switching that is a mentor's call.
 */
async function applyStack(tx: Tx, e: { id: string; userId: string; trackId: string }, slug: string, chosenById: string, skipLevelId?: string) {
  const [branches, existing] = await Promise.all([
    tx.select({ id: trackBranches.id, levelId: trackBranches.levelId }).from(trackBranches).where(and(eq(trackBranches.trackId, e.trackId), eq(trackBranches.slug, slug))),
    tx.select().from(enrollmentBranches).where(eq(enrollmentBranches.enrollmentId, e.id)),
  ]);
  for (const b of branches) {
    if (b.levelId === skipLevelId) continue;
    const ex = existing.find((x) => x.levelId === b.levelId);
    if (ex?.branchId === b.id) continue;
    if (ex && (await startedBranch(tx, e.userId, ex.branchId))) continue;
    await tx
      .insert(enrollmentBranches)
      .values({ enrollmentId: e.id, levelId: b.levelId, branchId: b.id, userId: e.userId, chosenById })
      .onConflictDoUpdate({ target: [enrollmentBranches.enrollmentId, enrollmentBranches.levelId], set: { branchId: b.id, chosenById, chosenAt: new Date() } });
  }
}

/**
 * Onboarding answers + the learner's FIRST track (their own pick). It never sets a level.
 * Re-submitting updates the answers; it doesn't enrol them in a second track.
 */
export async function completeOnboarding(
  a: MemberAccess,
  input: { goalTrackId: string; stack?: string | null; experience: string; links: string[]; hoursPerWeek: number },
) {
  const experience = input.experience.trim();
  if (experience.length < 10) throw fail.badRequest("Tell your mentor a little about what you've done so far.");
  if (!Number.isInteger(input.hoursPerWeek) || input.hoursPerWeek < 1 || input.hoursPerWeek > 80) throw fail.badRequest("Hours per week must be between 1 and 80.");
  const links = httpsList(input.links);
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, input.goalTrackId), eq(tracks.spaceId, a.space.id), eq(tracks.isPublished, true)))
    .limit(1);
  if (!track) throw fail.notFound("Track not found");
  if (!a.spaceMembershipRole) throw fail.forbidden("Join this space as a learner to enrol in a track.");
  const stacks = (await trackStacks([track.id])).get(track.id) ?? [];
  const stack = stacks.find((x) => x.slug === input.stack) ?? null;

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: trackEnrollments.id, trackId: trackEnrollments.trackId }).from(trackEnrollments).where(and(eq(trackEnrollments.spaceId, a.space.id), eq(trackEnrollments.userId, a.user.id)));
    let enrolled = existing.some((e) => e.trackId === track.id);
    if (!existing.length) {
      if (track.prerequisiteTrackId) {
        throw fail.badRequest("That track has a prerequisite. Start with the track it builds on; a mentor can add this one later.");
      }
      if (stacks.length && !stack) throw fail.badRequest(`Pick how you want to learn ${track.title}: ${stacks.map((x) => x.title).join(" or ")}.`);
      const [e] = await tx
        .insert(trackEnrollments)
        .values({ trackId: track.id, spaceId: a.space.id, communityId: a.community.id, userId: a.user.id })
        .returning({ id: trackEnrollments.id });
      enrolled = true;
      if (stack) await applyStack(tx, { id: e.id, userId: a.user.id, trackId: track.id }, stack.slug, a.user.id);
      await logActivity(
        {
          actorUserId: a.user.id,
          actionType: "TRACK_ENROLLED",
          communityId: a.community.id,
          spaceId: a.space.id,
          entityType: "enrollment",
          entityId: e.id,
          metadata: { track: track.title, firstTrack: true, ...(stack ? { stack: stack.title } : {}) },
        },
        tx,
      );
    }
    await tx
      .insert(spaceIntakes)
      .values({ spaceId: a.space.id, userId: a.user.id, communityId: a.community.id, goalTrackId: track.id, experience, links, hoursPerWeek: input.hoursPerWeek })
      .onConflictDoUpdate({
        target: [spaceIntakes.spaceId, spaceIntakes.userId],
        set: { goalTrackId: track.id, experience, links, hoursPerWeek: input.hoursPerWeek, updatedAt: new Date() },
      });
    return { trackId: track.id, enrolled };
  });
}

async function enrollmentInSpace(a: MemberAccess, enrollmentId: string) {
  const [e] = await db.select().from(trackEnrollments).where(and(eq(trackEnrollments.id, enrollmentId), eq(trackEnrollments.spaceId, a.space.id))).limit(1);
  if (!e) throw fail.notFound("Enrolment not found");
  return e;
}

/** A Mentor or Lead adds a learner to another track (their first track is their own pick). */
export async function enrolLearner(a: MemberAccess, input: { userId: string; trackId: string; note?: string | null }) {
  if (!spaceRules.canApproveExtraTrack(a.spaceRole)) throw fail.forbidden("Only Mentors and Leads can add a learner to another track.");
  if (input.userId === a.user.id) throw fail.forbidden("Ask another Mentor or Lead to approve your own track.");
  const [member] = await db.select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, a.space.id), eq(spaceMembers.userId, input.userId))).limit(1);
  if (!member) throw fail.notFound("That person isn't in this space.");
  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, input.trackId), eq(tracks.spaceId, a.space.id), eq(tracks.isPublished, true))).limit(1);
  if (!track) throw fail.notFound("Track not found");
  return db.transaction(async (tx) => {
    const [e] = await tx
      .insert(trackEnrollments)
      .values({
        trackId: track.id,
        spaceId: a.space.id,
        communityId: a.community.id,
        userId: input.userId,
        approvedById: a.user.id,
        approvalNote: input.note?.trim() || null,
      })
      .onConflictDoNothing()
      .returning({ id: trackEnrollments.id });
    if (!e) throw fail.conflict("They're already in that track.");
    await logActivity(
      { actorUserId: a.user.id, actionType: "TRACK_ENROLLED", communityId: a.community.id, spaceId: a.space.id, entityType: "enrollment", entityId: e.id, metadata: { track: track.title, learner: input.userId } },
      tx,
    );
    return e;
  });
}

/**
 * Pick an option ("React" or "Vue"). It holds for the whole track: the same option in the other
 * levels is set too, except where the learner has started a different one. Learners pick for
 * themselves; switching after starting needs a Mentor or Lead (DB trigger).
 */
export async function chooseBranch(a: MemberAccess, enrollmentId: string, branchId: string) {
  const e = await enrollmentInSpace(a, enrollmentId);
  const self = e.userId === a.user.id;
  if (!self && !spaceRules.canSwitchBranch(a.spaceRole)) throw fail.forbidden("Only the learner, a Mentor or a Lead can choose an option.");
  const [branch] = await db
    .select({ branch: trackBranches, tier: levels.tier })
    .from(trackBranches)
    .innerJoin(levels, eq(levels.id, trackBranches.levelId))
    .where(and(eq(trackBranches.id, branchId), eq(trackBranches.trackId, e.trackId)))
    .limit(1);
  if (!branch) throw fail.notFound("Option not found in this track");
  if (self && levelRules.rank(branch.tier) > levelRules.rank(e.tier)) throw fail.forbidden("You'll choose this when you reach that level.");

  await db.transaction(async (tx) => {
    await tx
      .insert(enrollmentBranches)
      .values({ enrollmentId: e.id, levelId: branch.branch.levelId, branchId: branch.branch.id, userId: e.userId, chosenById: a.user.id })
      .onConflictDoUpdate({
        target: [enrollmentBranches.enrollmentId, enrollmentBranches.levelId],
        set: { branchId: branch.branch.id, chosenById: a.user.id, chosenAt: new Date() },
      });
    // One stack for the whole track: the same option in the other levels follows this pick.
    await applyStack(tx, e, branch.branch.slug, a.user.id, branch.branch.levelId);
  });
  await logActivity({
    actorUserId: a.user.id,
    actionType: "BRANCH_CHOSEN",
    communityId: a.community.id,
    spaceId: a.space.id,
    entityType: "enrollment",
    entityId: e.id,
    metadata: { branch: branch.branch.title, learner: e.userId },
  });
}

/** Move a learner up exactly one level. Mentors and Leads only (never Managers, never yourself). */
export async function promoteLearner(a: MemberAccess, enrollmentId: string, input: { reason: string; placementAttemptId?: string | null }) {
  const e = await enrollmentInSpace(a, enrollmentId);
  const to = levelRules.next(e.tier);
  if (!to) throw fail.conflict("They're already at the last level of this track.");
  if (!levelRules.canPromote(a.spaceRole, a.user.id, e.userId, e.tier, to)) {
    throw fail.forbidden(e.userId === a.user.id ? "You can't promote yourself." : "Only Mentors and Leads can promote a learner.");
  }
  const reason = input.reason.trim();
  if (reason.length < 10) throw fail.badRequest("Write a short reason the learner will see (at least 10 characters).");
  if (input.placementAttemptId) {
    const [att] = await db.select().from(placementAttempts).where(eq(placementAttempts.id, input.placementAttemptId)).limit(1);
    if (!att || att.userId !== e.userId || att.trackId !== e.trackId || att.status !== "RECOMMENDED" || att.targetTier !== to) {
      throw fail.badRequest("That placement test isn't a matching recommendation.");
    }
  }
  const [lvl] = await db.select({ title: levels.title }).from(levels).where(and(eq(levels.trackId, e.trackId), eq(levels.tier, to))).limit(1);
  const [track] = await db.select({ title: tracks.title }).from(tracks).where(eq(tracks.id, e.trackId)).limit(1);

  const promoted = await db.transaction(async (tx) => {
    // The promotion row must exist before the tier changes (DB trigger, same transaction).
    const [promo] = await tx
      .insert(levelPromotions)
      .values({
        enrollmentId: e.id,
        trackId: e.trackId,
        spaceId: e.spaceId,
        communityId: e.communityId,
        userId: e.userId,
        fromLevel: e.tier,
        toLevel: to,
        promotedById: a.user.id,
        reason,
        placementAttemptId: input.placementAttemptId ?? null,
      })
      .returning({ id: levelPromotions.id });
    await tx.update(trackEnrollments).set({ tier: to }).where(eq(trackEnrollments.id, e.id));
    await tx.insert(feedItems).values({
      spaceId: e.spaceId,
      actorUserId: e.userId,
      kind: "LEVEL_PROMOTED",
      refId: promo.id,
      meta: { track: track?.title ?? "", level: lvl?.title ?? to },
    });
    await logActivity(
      {
        actorUserId: a.user.id,
        actionType: "LEVEL_PROMOTED",
        communityId: e.communityId,
        spaceId: e.spaceId,
        entityType: "enrollment",
        entityId: e.id,
        metadata: { learner: e.userId, from: e.tier, to, viaPlacement: !!input.placementAttemptId },
      },
      tx,
    );
    return { to, promotionId: promo.id };
  });
  await afterResponse(() => notifyPromoted(promoted.promotionId));
  return { to: promoted.to };
}

/* ════════════════════════════ The module workspace ════════════════════════════ */

/**
 * Authorise a progress write: the module must be on the learner's own path and unlocked.
 * Staff previewing without an enrolment can look but never earn.
 */
async function openModule(a: MemberAccess, moduleId: string) {
  const [row] = await db
    .select({ module: modules, level: levels, track: tracks })
    .from(modules)
    .innerJoin(levels, eq(levels.id, modules.levelId))
    .innerJoin(tracks, eq(tracks.id, levels.trackId))
    .where(and(eq(modules.id, moduleId), eq(modules.spaceId, a.space.id)))
    .limit(1);
  if (!row || !row.module.isPublished || !row.level.isPublished || !row.track.isPublished) throw fail.notFound("Module not found");
  const [enrollment] = await db
    .select()
    .from(trackEnrollments)
    .where(and(eq(trackEnrollments.trackId, row.track.id), eq(trackEnrollments.userId, a.user.id)))
    .limit(1);
  if (!enrollment) throw fail.forbidden("Join this track to make progress here.");
  if (enrollment.status === "PAUSED") throw fail.forbidden("Your enrolment in this track is paused. Talk to your mentor.");
  const progress = await loadTrackProgress({ trackId: row.track.id, userId: a.user.id, enrollment, preview: false });
  const node = progress.levels.flatMap((l) => l.modules).find((m) => m.id === moduleId);
  if (!node) throw fail.forbidden("This module isn't on your path yet.");
  if (node.locked) throw fail.forbidden("Finish the module before this one first. No skipping.");
  return { ...row, enrollment, node };
}

/**
 * The same step order the module player shows, enforced on the server: a lesson or quiz only
 * takes progress once every step before it is done (earlier lessons watched, earlier quizzes passed).
 */
function assertStepOpen(node: ModuleNode, stepId: string) {
  const at = node.steps.findIndex((st) => st.id === stepId);
  const st = node.steps[at];
  if (!st) throw fail.notFound("Step not found");
  if (!st.open) {
    const blocker = node.steps.slice(0, at).find((x) => !x.done);
    throw fail.forbidden(blocker?.kind === "quiz" ? `Pass "${blocker.title}" before moving on.` : `Finish "${blocker?.title ?? "the earlier steps"}" first.`);
  }
}

/**
 * The module id behind a /learn/<track>/<module> URL, looked up inside the caller's space only.
 * Says nothing about access: getModuleWorkspace decides that (and 404s the same way).
 */
export async function moduleIdBySlug(a: MemberAccess, trackSlug: string, moduleSlug: string) {
  const [row] = await db
    .select({ id: modules.id })
    .from(modules)
    .innerJoin(tracks, eq(tracks.id, modules.trackId))
    .where(and(eq(tracks.spaceId, a.space.id), eq(tracks.slug, trackSlug), eq(modules.slug, moduleSlug), eq(modules.spaceId, a.space.id)))
    .limit(1);
  if (!row) throw fail.notFound("Module not found");
  return row.id;
}

export async function getModuleWorkspace(a: MemberAccess, moduleId: string) {
  const [row] = await db
    .select({ module: modules, level: levels, track: tracks })
    .from(modules)
    .innerJoin(levels, eq(levels.id, modules.levelId))
    .innerJoin(tracks, eq(tracks.id, levels.trackId))
    .where(and(eq(modules.id, moduleId), eq(modules.spaceId, a.space.id)))
    .limit(1);
  const editor = spaceRules.canEditCurriculum(a.spaceRole);
  if (!row) throw fail.notFound("Module not found");
  const live = row.module.isPublished && row.level.isPublished && row.track.isPublished;
  if (!live && !editor) throw fail.notFound("Module not found");

  const [enrollment] = await db.select().from(trackEnrollments).where(and(eq(trackEnrollments.trackId, row.track.id), eq(trackEnrollments.userId, a.user.id))).limit(1);
  const staffPreview = !enrollment && spaceRules.bypassesLocks(a.spaceRole);
  if (!enrollment && !staffPreview) throw fail.forbidden("Join this track to open its modules.");

  let node: ModuleNode | null = null;
  let lockedBy: string | null = null;
  /** The module after this one on the learner's path (for "continue" once this one is done). */
  let next: { id: string; slug: string; title: string } | null = null;
  if (enrollment && live) {
    const progress = await loadTrackProgress({ trackId: row.track.id, userId: a.user.id, enrollment, preview: false });
    const all = progress.levels.flatMap((l) => l.modules);
    const at = all.findIndex((m) => m.id === moduleId);
    node = all[at] ?? null;
    if (!node) throw fail.forbidden("This module isn't on your path yet.");
    if (node.locked) lockedBy = all.find((m) => !m.complete && !m.placedOut && !m.locked)?.title ?? null;
    const after = all[at + 1];
    if (after) next = { id: after.id, slug: after.slug, title: after.title };
  }

  const [res, cps, qs] = await Promise.all([
    db.select().from(resources).where(and(eq(resources.moduleId, moduleId), eq(resources.isPublished, true))).orderBy(asc(resources.position), asc(resources.createdAt)),
    db.select().from(checkpoints).where(eq(checkpoints.moduleId, moduleId)).orderBy(asc(checkpoints.position), asc(checkpoints.createdAt)),
    db.select().from(quizQuestions).where(eq(quizQuestions.moduleId, moduleId)).orderBy(asc(quizQuestions.position)),
  ]);
  const [prog, attempts, subs] = await Promise.all([
    res.length
      ? db.select().from(resourceProgress).where(and(eq(resourceProgress.userId, a.user.id), inArray(resourceProgress.resourceId, res.map((r) => r.id))))
      : Promise.resolve([]),
    db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, a.user.id), eq(quizAttempts.moduleId, moduleId))).orderBy(desc(quizAttempts.createdAt)),
    db.select().from(submissions).where(and(eq(submissions.userId, a.user.id), eq(submissions.moduleId, moduleId))).orderBy(desc(submissions.createdAt)),
  ]);
  const reviews = subs.length
    ? await db
        .select({ review: submissionReviews, reviewerName: users.name })
        .from(submissionReviews)
        .leftJoin(users, eq(users.id, submissionReviews.reviewerId))
        .where(inArray(submissionReviews.submissionId, subs.map((s) => s.id)))
        .orderBy(desc(submissionReviews.createdAt))
    : [];

  const showKeys = staffPreview && spaceRules.canSeeAnswerKeys(a.spaceRole);
  const doneIds = new Set(prog.filter((p) => p.completedAt).map((p) => p.resourceId));
  const lessonDone = (id: string | null) => {
    if (!id) return true;
    const r = res.find((x) => x.id === id);
    return !r || r.type !== "VIDEO" || trackingFor(r.provider ?? "EXTERNAL") === "none" || doneIds.has(id);
  };

  return {
    module: row.module,
    level: row.level,
    track: row.track,
    enrollment: enrollment ?? null,
    preview: staffPreview || !live,
    locked: !!node?.locked,
    lockedBy,
    placedOut: !!node?.placedOut,
    node,
    next,
    resources: res.map((r) => {
      const p = prog.find((x) => x.resourceId === r.id);
      return { ...r, watchedPct: p?.watchedPct ?? 0, completed: !!p?.completedAt, lastPositionSeconds: p?.lastPositionSeconds ?? 0 };
    }),
    checkpoints: cps.map((c) => {
      const mine = attempts.filter((t) => t.checkpointId === c.id);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        passThreshold: c.passThreshold,
        afterResourceId: c.afterResourceId,
        open: lessonDone(c.afterResourceId),
        passed: mine.some((t) => t.passed),
        best: mine.reduce((m, t) => Math.max(m, t.scorePct), 0),
        attempts: mine.length,
        cooldownUntil: cooldownUntil(mine),
        // Answer keys never leave the server for learners.
        questions: qs
          .filter((q) => q.checkpointId === c.id)
          .map((q) => ({ id: q.id, prompt: q.prompt, codeSnippet: q.codeSnippet, options: q.options, ...(showKeys ? { correctOptionIndex: q.correctOptionIndex } : {}) })),
      };
    }),
    submissions: subs.map((s) => ({ ...s, reviews: reviews.filter((r) => r.review.submissionId === s.id) })),
  };
}

/** Two failed attempts in a row → wait 10 minutes. */
const COOLDOWN_MS = 10 * 60 * 1000;
function cooldownUntil(attemptsNewestFirst: { passed: boolean; createdAt: Date }[]): Date | null {
  const [a1, a2] = attemptsNewestFirst;
  if (!a1 || !a2 || a1.passed || a2.passed) return null;
  const until = new Date(a1.createdAt.getTime() + COOLDOWN_MS);
  return until > new Date() ? until : null;
}

/* ── Watch time (server-credited) ─────────────────────────────────── */

/** Heartbeats further apart than this start a new viewing session and credit nothing. */
const MAX_GAP_S = 75;
/** Fastest playback speed that still counts in full. */
const MAX_RATE = 2;
/** A video counts as watched at this share of its length (credits, outros). */
const COMPLETE_AT = 0.9;

/**
 * One heartbeat from the lesson player. The client reports what it sees; the server decides
 * what to credit: never more than the wall-clock time since the last heartbeat (× MAX_RATE),
 * never for seeking, and never past the video's length. There is no "mark as watched".
 */
export async function recordHeartbeat(a: MemberAccess, resourceId: string, input: { position: number; playing: boolean; rate?: number }) {
  const [res] = await db.select().from(resources).where(and(eq(resources.id, resourceId), eq(resources.spaceId, a.space.id), eq(resources.isPublished, true))).limit(1);
  if (!res || res.type !== "VIDEO" || !res.provider || !res.durationSeconds) throw fail.notFound("Lesson not found");
  const mode = trackingFor(res.provider);
  if (mode === "none") throw fail.badRequest("This lesson opens outside Lenigo and can't be tracked.");
  const open = await openModule(a, res.moduleId);
  assertStepOpen(open.node, res.id);
  const duration = res.durationSeconds;
  const position = Math.max(0, Math.min(duration, Math.floor(input.position || 0)));

  return db.transaction(async (tx) => {
    const now = new Date();
    const [p] = await tx
      .select()
      .from(resourceProgress)
      .where(and(eq(resourceProgress.resourceId, res.id), eq(resourceProgress.userId, a.user.id)))
      .for("update")
      .limit(1);
    if (!p) {
      await tx.insert(resourceProgress).values({ resourceId: res.id, userId: a.user.id, spaceId: a.space.id, lastHeartbeatAt: now, lastPositionSeconds: position }).onConflictDoNothing();
      return { watchedPct: 0, completed: false };
    }
    if (p.completedAt) {
      await tx.update(resourceProgress).set({ lastPositionSeconds: position, lastHeartbeatAt: now }).where(and(eq(resourceProgress.resourceId, res.id), eq(resourceProgress.userId, a.user.id)));
      return { watchedPct: p.watchedPct, completed: true };
    }
    const elapsed = p.lastHeartbeatAt ? (now.getTime() - p.lastHeartbeatAt.getTime()) / 1000 : Infinity;
    let credit = 0;
    if (elapsed > 0 && elapsed <= MAX_GAP_S && input.playing) {
      if (mode === "player") {
        const rate = Math.max(1, Math.min(MAX_RATE, input.rate ?? 1));
        credit = Math.max(0, Math.min(position - p.lastPositionSeconds, elapsed * rate));
      } else {
        credit = elapsed; // Drive: time on the lesson page, capped by the gap.
      }
    }
    const watched = Math.min(duration, p.watchedSeconds + Math.floor(credit));
    const watchedPct = Math.min(100, Math.floor((watched / duration) * 100));
    const completed = watched >= duration * COMPLETE_AT;
    await tx
      .update(resourceProgress)
      .set({ watchedSeconds: watched, watchedPct: completed ? 100 : watchedPct, lastPositionSeconds: position, lastHeartbeatAt: now, completedAt: completed ? now : null })
      .where(and(eq(resourceProgress.resourceId, res.id), eq(resourceProgress.userId, a.user.id)));
    if (completed && !open.node.placedOut) {
      await awardPoints(
        { spaceId: a.space.id, communityId: a.community.id, userId: a.user.id, reason: "VIDEO_COMPLETED", dedupeKey: `video:${res.id}`, refId: res.id, trackId: open.track.id },
        tx,
      );
    }
    return { watchedPct: completed ? 100 : watchedPct, completed };
  });
}

/* ── Checkpoints ──────────────────────────────────────────────────── */

export async function submitCheckpoint(a: MemberAccess, checkpointId: string, answers: number[]) {
  const [cp] = await db.select().from(checkpoints).where(and(eq(checkpoints.id, checkpointId), eq(checkpoints.spaceId, a.space.id))).limit(1);
  if (!cp) throw fail.notFound("Checkpoint not found");
  const open = await openModule(a, cp.moduleId);
  assertStepOpen(open.node, cp.id);

  if (cp.afterResourceId) {
    const [r] = await db.select().from(resources).where(eq(resources.id, cp.afterResourceId)).limit(1);
    if (r && r.isPublished && r.type === "VIDEO" && trackingFor(r.provider ?? "EXTERNAL") !== "none") {
      const [p] = await db.select({ done: resourceProgress.completedAt }).from(resourceProgress).where(and(eq(resourceProgress.resourceId, r.id), eq(resourceProgress.userId, a.user.id))).limit(1);
      if (!p?.done) throw fail.forbidden(`Finish "${r.title}" before this checkpoint.`);
    }
  }
  const mine = await db.select().from(quizAttempts).where(and(eq(quizAttempts.checkpointId, cp.id), eq(quizAttempts.userId, a.user.id))).orderBy(desc(quizAttempts.createdAt));
  if (mine.some((t) => t.passed)) throw fail.conflict("You've already passed this checkpoint.");
  const wait = cooldownUntil(mine);
  if (wait) throw fail.tooMany(`Two misses in a row. Rewatch the lesson and try again in ${Math.ceil((wait.getTime() - Date.now()) / 60000)} min.`);

  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.checkpointId, cp.id)).orderBy(asc(quizQuestions.position));
  if (!qs.length) throw fail.conflict("This checkpoint has no questions yet.");
  if (answers.length !== qs.length) throw fail.badRequest("Answer every question.");
  const wrong: number[] = [];
  qs.forEach((q, i) => {
    if (answers[i] !== q.correctOptionIndex) wrong.push(i);
  });
  const scorePct = Math.round(((qs.length - wrong.length) / qs.length) * 100);
  const passed = scorePct >= cp.passThreshold;

  await db.transaction(async (tx) => {
    await tx.insert(quizAttempts).values({ checkpointId: cp.id, moduleId: cp.moduleId, spaceId: a.space.id, userId: a.user.id, scorePct, passed, answers });
    if (passed) {
      if (!open.node.placedOut) {
        await awardPoints(
          { spaceId: a.space.id, communityId: a.community.id, userId: a.user.id, reason: "CHECKPOINT_PASSED", dedupeKey: `checkpoint:${cp.id}`, refId: cp.id, trackId: open.track.id },
          tx,
        );
      }
      await logActivity(
        { actorUserId: a.user.id, actionType: "CHECKPOINT_PASSED", communityId: a.community.id, spaceId: a.space.id, entityType: "checkpoint", entityId: cp.id, metadata: { scorePct } },
        tx,
      );
    }
  });
  // Explanations only after a pass; a miss only says WHICH questions were wrong, never the answers.
  return {
    scorePct,
    passed,
    passThreshold: cp.passThreshold,
    wrong: passed ? [] : wrong,
    explanations: passed ? qs.map((q) => q.explanation) : [],
  };
}

/* ── Capstone project ─────────────────────────────────────────────── */

const httpsUrl = (raw: string | null | undefined, label: string) => {
  if (!raw?.trim()) return null;
  const u = parseHttpsUrl(raw);
  if (!u) throw fail.badRequest(`${label} must be a complete https link.`);
  return u;
};

export async function submitProject(a: MemberAccess, moduleId: string, input: { repoUrl: string; liveUrl?: string | null; notes?: string | null }) {
  const open = await openModule(a, moduleId);
  const n = open.node;
  if (n.videosDone < n.videos) throw fail.forbidden("Watch every lesson video before submitting the project.");
  if (n.checkpointsPassed < n.checkpoints) throw fail.forbidden("Pass every checkpoint before submitting the project.");
  if (n.submission?.status === "APPROVED") throw fail.conflict("This project is already approved.");
  if (n.submission?.status === "PENDING") throw fail.conflict("Your project is waiting for a mentor's review.");
  const repoUrl = httpsUrl(input.repoUrl, "Repository link");
  if (!repoUrl) throw fail.badRequest("Add the link to your code.");
  const liveUrl = httpsUrl(input.liveUrl, "Live link");
  const notes = input.notes?.trim().slice(0, 2000) || null;

  const [row] = await db
    .insert(submissions)
    .values({ moduleId, spaceId: a.space.id, communityId: a.community.id, userId: a.user.id, repoUrl, liveUrl, notes })
    .returning({ id: submissions.id });
  await logActivity({
    actorUserId: a.user.id,
    actionType: "SUBMISSION_CREATED",
    communityId: a.community.id,
    spaceId: a.space.id,
    entityType: "submission",
    entityId: row.id,
    metadata: { module: open.module.title },
  });
  return row;
}

/** A learner's approved capstone projects (public profile). */
export async function approvedProjects(userId: string) {
  return db
    .select({ id: submissions.id, repoUrl: submissions.repoUrl, liveUrl: submissions.liveUrl, reviewedAt: submissions.reviewedAt, module: modules.title, track: tracks.title })
    .from(submissions)
    .innerJoin(modules, eq(modules.id, submissions.moduleId))
    .innerJoin(levels, eq(levels.id, modules.levelId))
    .innerJoin(tracks, eq(tracks.id, levels.trackId))
    .where(and(eq(submissions.userId, userId), eq(submissions.status, "APPROVED")))
    .orderBy(desc(submissions.reviewedAt))
    .limit(24);
}

