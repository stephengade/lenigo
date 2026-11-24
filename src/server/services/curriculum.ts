import "server-only";
import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import {
  checkpoints,
  enrollmentBranches,
  levels,
  modules,
  placementQuestions,
  quizAttempts,
  quizQuestions,
  resourceProgress,
  resources,
  submissions,
  trackBranches,
  trackEnrollments,
  tracks,
  type LevelTier,
} from "@/server/db/schema";
import { fail, type MemberAccess } from "@/server/auth/access";
import { logActivity } from "@/server/activity";
import { env } from "@/server/env";
import { LEVEL_LABEL, LEVELS, space as spaceRules } from "@/lib/permissions";
import { parseArticleUrl, parseVideoSource } from "@/lib/video";
import { slugify } from "@/lib/utils";

/**
 * The curriculum builder (Leads and Managers). Every function re-checks the caller's role
 * and that each id belongs to the caller's space (ids from the client are never trusted).
 * Learner progress is protected: anything with progress is unpublished, not deleted.
 */

function assertEditor(a: MemberAccess) {
  if (!spaceRules.canEditCurriculum(a.spaceRole)) throw fail.forbidden("Only Leads and Managers can edit the curriculum.");
}

const log = (a: MemberAccess, entityType: string, entityId: string, metadata: Record<string, unknown>, tx?: Tx) =>
  logActivity(
    { actorUserId: a.user.id, actionType: "CURRICULUM_CHANGED", communityId: a.community.id, spaceId: a.space.id, entityType, entityId, metadata },
    tx ?? db,
  );

/* ── Lookups scoped to the space ─────────────────────────────────── */

async function getTrack(a: MemberAccess, id: string) {
  const [row] = await db.select().from(tracks).where(and(eq(tracks.id, id), eq(tracks.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Track not found");
  return row;
}
async function getLevel(a: MemberAccess, id: string) {
  const [row] = await db.select().from(levels).where(and(eq(levels.id, id), eq(levels.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Level not found");
  return row;
}
async function getBranch(a: MemberAccess, id: string) {
  const [row] = await db.select().from(trackBranches).where(and(eq(trackBranches.id, id), eq(trackBranches.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Branch not found");
  return row;
}
async function getModule(a: MemberAccess, id: string) {
  const [row] = await db.select().from(modules).where(and(eq(modules.id, id), eq(modules.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Module not found");
  return row;
}
async function getResource(a: MemberAccess, id: string) {
  const [row] = await db.select().from(resources).where(and(eq(resources.id, id), eq(resources.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Lesson not found");
  return row;
}
async function getCheckpoint(a: MemberAccess, id: string) {
  const [row] = await db.select().from(checkpoints).where(and(eq(checkpoints.id, id), eq(checkpoints.spaceId, a.space.id))).limit(1);
  if (!row) throw fail.notFound("Checkpoint not found");
  return row;
}

/* ── Read models ──────────────────────────────────────────────────── */

/** Tracks of a space with simple counts. Learners only ever see published ones. */
export async function listTracks(spaceId: string, opts: { publishedOnly?: boolean } = {}) {
  const rows = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.spaceId, spaceId), opts.publishedOnly ? eq(tracks.isPublished, true) : undefined))
    .orderBy(asc(tracks.position), asc(tracks.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((t) => t.id);
  const [mods, enrolled] = await Promise.all([
    db
      .select({ trackId: levels.trackId, n: count(modules.id), published: sql<number>`count(*) filter (where ${modules.isPublished})`.mapWith(Number) })
      .from(modules)
      .innerJoin(levels, eq(levels.id, modules.levelId))
      .where(inArray(levels.trackId, ids))
      .groupBy(levels.trackId),
    db.select({ trackId: trackEnrollments.trackId, n: count() }).from(trackEnrollments).where(inArray(trackEnrollments.trackId, ids)).groupBy(trackEnrollments.trackId),
  ]);
  return rows.map((t) => ({
    ...t,
    modules: mods.find((m) => m.trackId === t.id)?.n ?? 0,
    publishedModules: mods.find((m) => m.trackId === t.id)?.published ?? 0,
    learners: enrolled.find((e) => e.trackId === t.id)?.n ?? 0,
    prerequisite: t.prerequisiteTrackId ? (rows.find((r) => r.id === t.prerequisiteTrackId) ?? null) : null,
  }));
}

/** Everything the track page of the builder needs. */
export async function getTrackEditor(a: MemberAccess, trackId: string) {
  assertEditor(a);
  const track = await getTrack(a, trackId);
  const [lv, br, mods, bank, others] = await Promise.all([
    db.select().from(levels).where(eq(levels.trackId, track.id)),
    db.select().from(trackBranches).where(eq(trackBranches.trackId, track.id)).orderBy(asc(trackBranches.position), asc(trackBranches.createdAt)),
    db
      .select({
        module: modules,
        resources: sql<number>`(select count(*) from ${resources} r where r.module_id = "modules"."id")`.mapWith(Number),
        checkpoints: sql<number>`(select count(*) from ${checkpoints} c where c.module_id = "modules"."id")`.mapWith(Number),
      })
      .from(modules)
      .innerJoin(levels, eq(levels.id, modules.levelId))
      .where(eq(levels.trackId, track.id))
      .orderBy(asc(modules.position), asc(modules.createdAt)),
    db.select().from(placementQuestions).where(and(eq(placementQuestions.trackId, track.id), eq(placementQuestions.isActive, true))).orderBy(asc(placementQuestions.createdAt)),
    db.select({ id: tracks.id, title: tracks.title }).from(tracks).where(and(eq(tracks.spaceId, a.space.id), ne(tracks.id, track.id))).orderBy(asc(tracks.position)),
  ]);
  const ordered = [...lv].sort((x, y) => LEVELS.indexOf(x.tier) - LEVELS.indexOf(y.tier));
  return {
    track,
    otherTracks: others,
    placementQuestions: bank,
    levels: ordered.map((l) => ({
      ...l,
      branches: br.filter((b) => b.levelId === l.id),
      modules: mods.filter((m) => m.module.levelId === l.id).map((m) => ({ ...m.module, resourceCount: m.resources, checkpointCount: m.checkpoints })),
    })),
  };
}

/** Everything the module page of the builder needs, answer keys included (editors only). */
export async function getModuleEditor(a: MemberAccess, moduleId: string) {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  const level = await getLevel(a, mod.levelId);
  const [track, branches, res, cps, qs, progress] = await Promise.all([
    getTrack(a, level.trackId),
    db.select().from(trackBranches).where(eq(trackBranches.levelId, level.id)).orderBy(asc(trackBranches.position)),
    db.select().from(resources).where(eq(resources.moduleId, mod.id)).orderBy(asc(resources.position), asc(resources.createdAt)),
    db.select().from(checkpoints).where(eq(checkpoints.moduleId, mod.id)).orderBy(asc(checkpoints.position), asc(checkpoints.createdAt)),
    db.select().from(quizQuestions).where(eq(quizQuestions.moduleId, mod.id)).orderBy(asc(quizQuestions.position)),
    moduleHasProgress(mod.id),
  ]);
  return {
    module: mod,
    level,
    track,
    branches,
    hasProgress: progress,
    resources: res,
    checkpoints: cps.map((c) => ({ ...c, questions: qs.filter((q) => q.checkpointId === c.id) })),
  };
}

async function moduleHasProgress(moduleId: string, tx: Tx | typeof db = db) {
  const [row] = await tx.execute<{ any: boolean }>(sql`
    select (
      exists (select 1 from ${resourceProgress} rp join ${resources} r on r.id = rp.resource_id where r.module_id = ${moduleId})
      or exists (select 1 from ${quizAttempts} qa where qa.module_id = ${moduleId})
      or exists (select 1 from ${submissions} s where s.module_id = ${moduleId})
    ) as any`);
  return Boolean(row?.any);
}

/* ── Tracks ───────────────────────────────────────────────────────── */

export async function createTrack(a: MemberAccess, input: { title: string; description?: string | null }) {
  assertEditor(a);
  const title = input.title.trim();
  if (title.length < 2) throw fail.badRequest("Give the track a name.");
  return db.transaction(async (tx) => {
    const base = slugify(title).slice(0, 40) || "track";
    const taken = new Set(
      (await tx.select({ slug: tracks.slug }).from(tracks).where(eq(tracks.spaceId, a.space.id))).map((r) => r.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const [{ pos }] = await tx.select({ pos: max(tracks.position) }).from(tracks).where(eq(tracks.spaceId, a.space.id));
    const [track] = await tx
      .insert(tracks)
      .values({ spaceId: a.space.id, communityId: a.community.id, slug, title, description: input.description?.trim() || null, position: (pos ?? -1) + 1 })
      .returning();
    // Every track has its three steps from the start; the space renames them.
    await tx.insert(levels).values(LEVELS.map((tier, position) => ({ trackId: track.id, spaceId: a.space.id, tier, title: LEVEL_LABEL[tier], position })));
    await log(a, "track", track.id, { action: "create", title }, tx);
    return track;
  });
}

export type TrackPatch = {
  title?: string;
  description?: string | null;
  isPublished?: boolean;
  prerequisiteTrackId?: string | null;
  prerequisiteTier?: LevelTier | null;
  placementTaskMd?: string | null;
};

export async function updateTrack(a: MemberAccess, trackId: string, patch: TrackPatch) {
  assertEditor(a);
  const track = await getTrack(a, trackId);
  const set: Partial<typeof tracks.$inferInsert> = {};
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 2) throw fail.badRequest("Give the track a name.");
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.placementTaskMd !== undefined) set.placementTaskMd = patch.placementTaskMd?.trim() || null;

  if (patch.prerequisiteTrackId !== undefined || patch.prerequisiteTier !== undefined) {
    const pre = patch.prerequisiteTrackId ?? null;
    const tier = pre ? (patch.prerequisiteTier ?? "INTERMEDIATE") : null;
    if (pre) {
      if (pre === track.id) throw fail.badRequest("A track can't require itself.");
      const other = await getTrack(a, pre);
      // Walk the chain so two tracks can't require each other.
      let cursor: string | null = other.prerequisiteTrackId;
      for (let hops = 0; cursor && hops < 20; hops++) {
        if (cursor === track.id) throw fail.badRequest(`${other.title} already requires ${track.title}.`);
        const [next] = await db.select({ p: tracks.prerequisiteTrackId }).from(tracks).where(eq(tracks.id, cursor)).limit(1);
        cursor = next?.p ?? null;
      }
    }
    set.prerequisiteTrackId = pre;
    set.prerequisiteTier = tier;
  }

  if (patch.isPublished === true && !track.isPublished) {
    const [first] = await db
      .select({ n: count(modules.id) })
      .from(modules)
      .innerJoin(levels, eq(levels.id, modules.levelId))
      .where(and(eq(levels.trackId, track.id), eq(levels.tier, "BEGINNER"), eq(levels.isPublished, true), eq(modules.isPublished, true)));
    if (!first?.n) throw fail.badRequest("Publish the first level with at least one module before publishing the track.");
  }
  if (patch.isPublished !== undefined) set.isPublished = patch.isPublished;
  if (!Object.keys(set).length) return track;

  const [row] = await db.update(tracks).set(set).where(eq(tracks.id, track.id)).returning();
  await log(a, "track", track.id, { action: "update", fields: Object.keys(set) });
  return row;
}

export async function deleteTrack(a: MemberAccess, trackId: string) {
  assertEditor(a);
  const track = await getTrack(a, trackId);
  const [e] = await db.select({ n: count() }).from(trackEnrollments).where(eq(trackEnrollments.trackId, track.id));
  if (e.n) throw fail.conflict("Learners are enrolled in this track. Unpublish it instead so their progress is kept.");
  await db.delete(tracks).where(eq(tracks.id, track.id));
  await log(a, "track", track.id, { action: "delete", title: track.title });
}

export async function moveTrack(a: MemberAccess, trackId: string, direction: "up" | "down") {
  assertEditor(a);
  await getTrack(a, trackId);
  const rows = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.spaceId, a.space.id)).orderBy(asc(tracks.position), asc(tracks.createdAt));
  await reorder(rows.map((r) => r.id), trackId, direction, (id, position) => db.update(tracks).set({ position }).where(eq(tracks.id, id)));
}

/* ── Levels and branches ──────────────────────────────────────────── */

export async function updateLevel(a: MemberAccess, levelId: string, patch: { title?: string; isPublished?: boolean }) {
  assertEditor(a);
  const level = await getLevel(a, levelId);
  const set: Partial<typeof levels.$inferInsert> = {};
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 2) throw fail.badRequest("Give the level a name.");
    set.title = patch.title.trim();
  }
  if (patch.isPublished === true && !level.isPublished) {
    const [m] = await db.select({ n: count() }).from(modules).where(and(eq(modules.levelId, level.id), eq(modules.isPublished, true)));
    if (!m.n) throw fail.badRequest("Publish at least one module in this level first.");
  }
  if (patch.isPublished !== undefined) set.isPublished = patch.isPublished;
  if (!Object.keys(set).length) return level;
  const [row] = await db.update(levels).set(set).where(eq(levels.id, level.id)).returning();
  await log(a, "level", level.id, { action: "update", fields: Object.keys(set) });
  return row;
}

export async function createBranch(a: MemberAccess, levelId: string, input: { title: string; description?: string | null }) {
  assertEditor(a);
  const level = await getLevel(a, levelId);
  const title = input.title.trim();
  if (title.length < 2) throw fail.badRequest("Give the option a name.");
  const existing = await db.select({ slug: trackBranches.slug, position: trackBranches.position }).from(trackBranches).where(eq(trackBranches.levelId, level.id));
  const base = slugify(title).slice(0, 40) || "option";
  let slug = base;
  for (let n = 2; existing.some((b) => b.slug === slug); n++) slug = `${base}-${n}`;
  const [row] = await db
    .insert(trackBranches)
    .values({
      levelId: level.id,
      trackId: level.trackId,
      spaceId: a.space.id,
      slug,
      title,
      description: input.description?.trim() || null,
      position: Math.max(-1, ...existing.map((b) => b.position)) + 1,
    })
    .returning();
  await log(a, "branch", row.id, { action: "create", title });
  return row;
}

export async function updateBranch(a: MemberAccess, branchId: string, input: { title?: string; description?: string | null }) {
  assertEditor(a);
  const branch = await getBranch(a, branchId);
  const set: Partial<typeof trackBranches.$inferInsert> = {};
  if (input.title !== undefined) {
    if (input.title.trim().length < 2) throw fail.badRequest("Give the option a name.");
    set.title = input.title.trim();
  }
  if (input.description !== undefined) set.description = input.description?.trim() || null;
  if (!Object.keys(set).length) return branch;
  const [row] = await db.update(trackBranches).set(set).where(eq(trackBranches.id, branch.id)).returning();
  return row;
}

export async function deleteBranch(a: MemberAccess, branchId: string) {
  assertEditor(a);
  const branch = await getBranch(a, branchId);
  const [[chosen], [mods]] = await Promise.all([
    db.select({ n: count() }).from(enrollmentBranches).where(eq(enrollmentBranches.branchId, branch.id)),
    db.select({ n: count() }).from(modules).where(eq(modules.branchId, branch.id)),
  ]);
  if (chosen.n) throw fail.conflict("Learners have picked this option, so it can't be deleted.");
  if (mods.n) throw fail.conflict("Move or delete this option's modules first.");
  await db.delete(trackBranches).where(eq(trackBranches.id, branch.id));
  await log(a, "branch", branch.id, { action: "delete", title: branch.title });
}

/* ── Modules ──────────────────────────────────────────────────────── */

export async function createModule(a: MemberAccess, levelId: string, input: { title: string; summary?: string | null; branchId?: string | null }) {
  assertEditor(a);
  const level = await getLevel(a, levelId);
  const title = input.title.trim();
  if (title.length < 2) throw fail.badRequest("Give the module a name.");
  if (input.branchId) {
    const branch = await getBranch(a, input.branchId);
    if (branch.levelId !== level.id) throw fail.badRequest("That option belongs to another level.");
  }
  const [{ pos }] = await db.select({ pos: max(modules.position) }).from(modules).where(eq(modules.levelId, level.id));
  const [row] = await db
    .insert(modules)
    .values({ levelId: level.id, spaceId: a.space.id, title, summary: input.summary?.trim() || null, branchId: input.branchId ?? null, position: (pos ?? -1) + 1 })
    .returning();
  await log(a, "module", row.id, { action: "create", title });
  return row;
}

export type ModulePatch = { title?: string; summary?: string | null; projectBriefMd?: string | null; branchId?: string | null; isPublished?: boolean };

export async function updateModule(a: MemberAccess, moduleId: string, patch: ModulePatch) {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  const set: Partial<typeof modules.$inferInsert> = {};
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 2) throw fail.badRequest("Give the module a name.");
    set.title = patch.title.trim();
  }
  if (patch.summary !== undefined) set.summary = patch.summary?.trim() || null;
  if (patch.projectBriefMd !== undefined) set.projectBriefMd = patch.projectBriefMd?.trim() || null;
  if (patch.branchId !== undefined && patch.branchId !== mod.branchId) {
    if (await moduleHasProgress(mod.id)) throw fail.conflict("Learners have started this module, so it can't move to another option.");
    if (patch.branchId) {
      const branch = await getBranch(a, patch.branchId);
      if (branch.levelId !== mod.levelId) throw fail.badRequest("That option belongs to another level.");
    }
    set.branchId = patch.branchId;
  }

  const willPublish = patch.isPublished === true && !mod.isPublished;
  if (willPublish) {
    const brief = set.projectBriefMd !== undefined ? set.projectBriefMd : mod.projectBriefMd;
    if (!brief) throw fail.badRequest("Write the capstone project brief before publishing. Every module ends in a project.");
    const cps = await db
      .select({ id: checkpoints.id, title: checkpoints.title, n: sql<number>`(select count(*) from ${quizQuestions} q where q.checkpoint_id = "checkpoints"."id")`.mapWith(Number) })
      .from(checkpoints)
      .where(eq(checkpoints.moduleId, mod.id));
    if (!cps.length) throw fail.badRequest("Add at least one checkpoint before publishing.");
    const empty = cps.find((c) => c.n === 0);
    if (empty) throw fail.badRequest(`Checkpoint "${empty.title}" has no questions yet.`);
  }
  if (patch.isPublished !== undefined) set.isPublished = patch.isPublished;
  if (!Object.keys(set).length) return mod;
  const [row] = await db.update(modules).set(set).where(eq(modules.id, mod.id)).returning();
  await log(a, "module", mod.id, { action: patch.isPublished === undefined ? "update" : patch.isPublished ? "publish" : "unpublish", fields: Object.keys(set) });
  return row;
}

export async function deleteModule(a: MemberAccess, moduleId: string) {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  if (await moduleHasProgress(mod.id)) throw fail.conflict("Learners have progress in this module. Unpublish it instead.");
  await db.delete(modules).where(eq(modules.id, mod.id));
  await log(a, "module", mod.id, { action: "delete", title: mod.title });
}

export async function moveModule(a: MemberAccess, moduleId: string, direction: "up" | "down") {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  const rows = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.levelId, mod.levelId), mod.branchId ? eq(modules.branchId, mod.branchId) : sql`${modules.branchId} is null`))
    .orderBy(asc(modules.position), asc(modules.createdAt));
  await reorder(rows.map((r) => r.id), mod.id, direction, (id, position) => db.update(modules).set({ position }).where(eq(modules.id, id)));
}

/* ── Lessons (videos and articles) ────────────────────────────────── */

export type ResourceInput = {
  type: "VIDEO" | "ARTICLE";
  title: string;
  url: string;
  sourceName?: string | null;
  /** VIDEO: length in minutes (used when the YouTube API isn't configured). ARTICLE: reading time. */
  minutes?: number | null;
};

export async function addResource(a: MemberAccess, moduleId: string, input: ResourceInput) {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  const title = input.title.trim();
  if (title.length < 2) throw fail.badRequest("Give the lesson a title.");

  let values: typeof resources.$inferInsert;
  if (input.type === "VIDEO") {
    const source = parseVideoSource(input.url);
    if (!source) throw fail.badRequest("Paste a YouTube, Google Drive or https link.");
    let durationSeconds = input.minutes && input.minutes > 0 ? Math.round(input.minutes * 60) : null;
    if (source.provider === "YOUTUBE" && source.providerId) {
      const fromApi = await youTubeDurationSeconds(source.providerId);
      if (fromApi) durationSeconds = fromApi;
    }
    if (!durationSeconds) throw fail.badRequest("Enter the video's length in minutes.");
    if (durationSeconds > 6 * 3600) throw fail.badRequest("That video is longer than 6 hours. Split it into lessons.");
    values = {
      moduleId: mod.id,
      spaceId: a.space.id,
      type: "VIDEO",
      title,
      url: source.url,
      provider: source.provider,
      providerId: source.providerId,
      sourceName: input.sourceName?.trim() || null,
      durationSeconds,
      estMinutes: Math.ceil(durationSeconds / 60),
    };
  } else {
    const url = parseArticleUrl(input.url);
    if (!url) throw fail.badRequest("Articles must be https links.");
    values = {
      moduleId: mod.id,
      spaceId: a.space.id,
      type: "ARTICLE",
      title,
      url,
      sourceName: input.sourceName?.trim() || null,
      estMinutes: input.minutes && input.minutes > 0 ? Math.round(input.minutes) : null,
    };
  }
  const [{ pos }] = await db.select({ pos: max(resources.position) }).from(resources).where(eq(resources.moduleId, mod.id));
  const [row] = await db.insert(resources).values({ ...values, position: (pos ?? -1) + 1 }).returning();
  await log(a, "resource", row.id, { action: "create", type: row.type, provider: row.provider });
  return row;
}

export async function deleteResource(a: MemberAccess, resourceId: string) {
  assertEditor(a);
  const res = await getResource(a, resourceId);
  const [p] = await db.select({ n: count() }).from(resourceProgress).where(eq(resourceProgress.resourceId, res.id));
  if (p.n) throw fail.conflict("Learners have watched this lesson, so it can't be deleted.");
  await db.delete(resources).where(eq(resources.id, res.id));
  await log(a, "resource", res.id, { action: "delete", title: res.title });
}

export async function moveResource(a: MemberAccess, resourceId: string, direction: "up" | "down") {
  assertEditor(a);
  const res = await getResource(a, resourceId);
  const rows = await db.select({ id: resources.id }).from(resources).where(eq(resources.moduleId, res.moduleId)).orderBy(asc(resources.position), asc(resources.createdAt));
  await reorder(rows.map((r) => r.id), res.id, direction, (id, position) => db.update(resources).set({ position }).where(eq(resources.id, id)));
}

/**
 * Video length from the YouTube Data API (server-only key). Returns null when no key is
 * configured or the call fails, so the curator's number is used instead.
 */
async function youTubeDurationSeconds(videoId: string): Promise<number | null> {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { contentDetails?: { duration?: string } }[] };
    const iso = data.items?.[0]?.contentDetails?.duration;
    const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return null;
    const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

/* ── Checkpoints and questions ────────────────────────────────────── */

export async function addCheckpoint(a: MemberAccess, moduleId: string, input: { title: string; afterResourceId?: string | null; passThreshold?: number }) {
  assertEditor(a);
  const mod = await getModule(a, moduleId);
  const title = input.title.trim();
  if (title.length < 2) throw fail.badRequest("Give the checkpoint a title.");
  if (input.afterResourceId) {
    const res = await getResource(a, input.afterResourceId);
    if (res.moduleId !== mod.id) throw fail.badRequest("That lesson is in another module.");
  }
  const threshold = Math.round(input.passThreshold ?? 80);
  if (threshold < 50 || threshold > 100) throw fail.badRequest("Pass mark must be between 50% and 100%.");
  const [{ pos }] = await db.select({ pos: max(checkpoints.position) }).from(checkpoints).where(eq(checkpoints.moduleId, mod.id));
  const [row] = await db
    .insert(checkpoints)
    .values({ moduleId: mod.id, spaceId: a.space.id, title, afterResourceId: input.afterResourceId ?? null, passThreshold: threshold, position: (pos ?? -1) + 1 })
    .returning();
  await log(a, "checkpoint", row.id, { action: "create", title });
  return row;
}

export async function deleteCheckpoint(a: MemberAccess, checkpointId: string) {
  assertEditor(a);
  const cp = await getCheckpoint(a, checkpointId);
  const [att] = await db.select({ n: count() }).from(quizAttempts).where(eq(quizAttempts.checkpointId, cp.id));
  if (att.n) throw fail.conflict("Learners have taken this checkpoint, so it can't be deleted.");
  const mod = await getModule(a, cp.moduleId);
  if (mod.isPublished) {
    const [others] = await db.select({ n: count() }).from(checkpoints).where(and(eq(checkpoints.moduleId, mod.id), ne(checkpoints.id, cp.id)));
    if (!others.n) throw fail.conflict("A published module needs at least one checkpoint. Unpublish it first.");
  }
  await db.delete(checkpoints).where(eq(checkpoints.id, cp.id));
  await log(a, "checkpoint", cp.id, { action: "delete", title: cp.title });
}

export type QuestionInput = { prompt: string; codeSnippet?: string | null; options: string[]; correctOptionIndex: number; explanation?: string | null };

function cleanQuestion(input: QuestionInput) {
  const prompt = input.prompt.trim();
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (prompt.length < 3) throw fail.badRequest("Write the question.");
  if (options.length < 2 || options.length > 6) throw fail.badRequest("Give between 2 and 6 answer options.");
  if (new Set(options).size !== options.length) throw fail.badRequest("Answer options must be different.");
  if (!Number.isInteger(input.correctOptionIndex) || input.correctOptionIndex < 0 || input.correctOptionIndex >= options.length)
    throw fail.badRequest("Pick the correct answer.");
  return { prompt, options, correctOptionIndex: input.correctOptionIndex, codeSnippet: input.codeSnippet?.trim() || null, explanation: input.explanation?.trim() || null };
}

export async function addQuestion(a: MemberAccess, checkpointId: string, input: QuestionInput) {
  assertEditor(a);
  const cp = await getCheckpoint(a, checkpointId);
  const q = cleanQuestion(input);
  const [{ pos }] = await db.select({ pos: max(quizQuestions.position) }).from(quizQuestions).where(eq(quizQuestions.checkpointId, cp.id));
  const [row] = await db
    .insert(quizQuestions)
    .values({ ...q, checkpointId: cp.id, moduleId: cp.moduleId, spaceId: a.space.id, position: (pos ?? -1) + 1 })
    .returning({ id: quizQuestions.id });
  return row;
}

export async function deleteQuestion(a: MemberAccess, questionId: string) {
  assertEditor(a);
  const [q] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.spaceId, a.space.id))).limit(1);
  if (!q) throw fail.notFound("Question not found");
  const [att] = await db.select({ n: count() }).from(quizAttempts).where(eq(quizAttempts.checkpointId, q.checkpointId));
  // Answers are stored by position, so a checkpoint that has been taken keeps its questions.
  if (att.n) throw fail.conflict("Learners have answered this checkpoint, so its questions are locked. Add a new checkpoint instead.");
  const mod = await getModule(a, q.moduleId);
  if (mod.isPublished) {
    const [others] = await db.select({ n: count() }).from(quizQuestions).where(and(eq(quizQuestions.checkpointId, q.checkpointId), ne(quizQuestions.id, q.id)));
    if (!others.n) throw fail.conflict("A checkpoint in a published module needs at least one question.");
  }
  await db.delete(quizQuestions).where(eq(quizQuestions.id, q.id));
}

/* ── Placement question bank ──────────────────────────────────────── */

export async function addPlacementQuestion(a: MemberAccess, trackId: string, input: QuestionInput) {
  assertEditor(a);
  const track = await getTrack(a, trackId);
  const q = cleanQuestion(input);
  const [row] = await db
    .insert(placementQuestions)
    .values({ trackId: track.id, spaceId: a.space.id, prompt: q.prompt, codeSnippet: q.codeSnippet, options: q.options, correctOptionIndex: q.correctOptionIndex })
    .returning({ id: placementQuestions.id });
  return row;
}

/** Soft delete: attempts in progress keep their served questions. */
export async function retirePlacementQuestion(a: MemberAccess, questionId: string) {
  assertEditor(a);
  const res = await db
    .update(placementQuestions)
    .set({ isActive: false })
    .where(and(eq(placementQuestions.id, questionId), eq(placementQuestions.spaceId, a.space.id)))
    .returning({ id: placementQuestions.id });
  if (!res.length) throw fail.notFound("Question not found");
}

/* ── Helpers ──────────────────────────────────────────────────────── */

async function reorder(ids: string[], id: string, direction: "up" | "down", write: (id: string, position: number) => Promise<unknown>) {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // Rewrites every position (idempotent), which also repairs gaps and ties.
  for (const [position, rowId] of ids.entries()) await write(rowId, position);
}
