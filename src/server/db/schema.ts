/**
 * Lenigo data model.
 *
 * Tenancy is two levels deep:
 *   Community (e.g. "GDG OAU", "Claude Ambassadors") — provisioned by the Global House
 *     └── Space (e.g. "Web Development", "Data Science") — where learning happens
 *
 * Every learning record (curriculum, submissions, standups, points, workshops) is
 * scoped to a Space and carries its communityId too, so cross-space rollups and
 * tenant checks never need a join.
 *
 * Every table has Row Level Security enabled with no policies. The app talks to
 * Postgres over a direct server-side connection (which bypasses RLS), so this only
 * closes Supabase's auto-generated REST API to the anon/authenticated keys.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ───────────────────────────── Enums ───────────────────────────── */

export const globalRole = pgEnum("global_role", ["SUPER_ADMIN", "ADMIN", "VIEWER", "USER"]);
export const communityRole = pgEnum("community_role", ["OWNER", "ADMIN", "MEMBER"]);
export const spaceRole = pgEnum("space_role", ["LEAD", "MANAGER", "MENTOR", "MEMBER"]);
export const tenantStatus = pgEnum("tenant_status", ["ACTIVE", "SUSPENDED"]);
/** OPEN: any community member can join the space as a MEMBER. INVITE: invite only. */
export const joinPolicy = pgEnum("join_policy", ["OPEN", "INVITE"]);
/**
 * Internal ordering of the three steps in every track. What a space CALLS each step
 * ("Beginner", "Foundations", "Junior"...) lives in levels.title, so spaces pick their own words.
 */
export const levelTier = pgEnum("level_tier", ["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["ACTIVE", "PAUSED", "COMPLETED"]);
/**
 * Placement test lifecycle. A passed test never moves a level by itself: it ends in
 * RECOMMENDED, and a Mentor or Lead then records the promotion.
 */
export const placementStatus = pgEnum("placement_status", [
  "QUIZ",
  "TASK",
  "AWAITING_REVIEW",
  "RECOMMENDED",
  "NOT_RECOMMENDED",
  "EXPIRED",
]);
/**
 * VIDEO: a handpicked lesson video (we host no video). Required to complete a module.
 * ARTICLE: an external "learn more" link. Optional reading; never gates completion.
 */
export const resourceType = pgEnum("resource_type", ["VIDEO", "ARTICLE"]);
/**
 * Where a lesson video lives (lib/video.ts):
 *  YOUTUBE       primary source; embedded in-app, watch time tracked via the player API
 *  GOOGLE_DRIVE  embedded in-app via Drive's preview player; credited by time on page
 *  EXTERNAL      any other https link; opens in a new tab, can't be tracked
 */
export const videoProvider = pgEnum("video_provider", ["YOUTUBE", "GOOGLE_DRIVE", "EXTERNAL"]);
export const submissionStatus = pgEnum("submission_status", ["PENDING", "APPROVED", "NEEDS_REVISION"]);
export const workshopType = pgEnum("workshop_type", ["ONLINE_CALL", "PHYSICAL"]);
/**
 * What earns points. Members may see these categories; the WEIGHTS live only in
 * server/points/rules.ts (server-only) and are never sent to the client.
 */
export const pointsReason = pgEnum("points_reason", [
  "STANDUP",
  "VIDEO_COMPLETED",
  "CHECKPOINT_PASSED",
  "PROJECT_APPROVED",
  "REVIEW_SESSION_ATTENDED",
  "WORKSHOP_ATTENDED",
  "STREAK_BONUS",
  "ADJUSTMENT",
]);
export const feedKind = pgEnum("feed_kind", ["STANDUP", "CHECKPOINT_PASSED", "PROJECT_APPROVED", "LEVEL_PROMOTED", "STREAK_MILESTONE"]);
/** STANDUP_REVIEW: a live session where members present progress and a mentor marks attendance. */
export const workshopKind = pgEnum("workshop_kind", ["WORKSHOP", "STANDUP_REVIEW"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────────── Identity ───────────────────────────── */

/** Mirrors auth.users. `id` is the Supabase Auth user id; rows are upserted on sign-in. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    githubUsername: text("github_username"),
    username: text("username"),
    bio: text("bio"),
    globalRole: globalRole("global_role").notNull().default("USER"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Set by a Super Admin: the account can't sign in or use the API until reactivated. History is kept. */
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedById: uuid("deactivated_by_id"),
    /** Learning emails (review results, promotions, session reminders). Invites and sign-in codes always send. */
    emailNotifications: boolean("email_notifications").notNull().default(true),
  },
  (t) => [
    uniqueIndex("users_email_key").on(sql`lower(${t.email})`),
    uniqueIndex("users_github_key").on(sql`lower(${t.githubUsername})`),
    uniqueIndex("users_username_key").on(sql`lower(${t.username})`),
  ],
).enableRLS();

/* ───────────────────────────── Tenancy ───────────────────────────── */

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    accent: text("accent"),
    timezone: text("timezone").notNull().default("UTC"),
    status: tenantStatus("status").notNull().default("ACTIVE"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("communities_slug_key").on(t.slug)],
).enableRLS();

export const communityMembers = pgTable(
  "community_members",
  {
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: communityRole("role").notNull().default("MEMBER"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] }), index("community_members_user_idx").on(t.userId)],
).enableRLS();

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    accent: text("accent"),
    joinPolicy: joinPolicy("join_policy").notNull().default("OPEN"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("spaces_community_slug_key").on(t.communityId, t.slug)],
).enableRLS();

export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    role: spaceRole("role").notNull().default("MEMBER"),
    /* A learner's level is per track: see track_enrollments. */
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    index("space_members_user_idx").on(t.userId),
    index("space_members_community_idx").on(t.communityId),
  ],
).enableRLS();

/**
 * One table for both kinds of invite. Exactly one of communityRole / spaceRole is set:
 *  - community invite: communityRole set, spaceId null
 *  - space invite: spaceRole + spaceId set (redeeming also makes you a community MEMBER)
 * `email` null means a shareable link, bounded by maxUses / expiresAt.
 * Only a SHA-256 hash of the token is stored.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    communityRole: communityRole("community_role"),
    spaceRole: spaceRole("space_role"),
    email: text("email"),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** When the invite email last went out (creation or resend); resends are rate-limited on it. */
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    /** sha256 of the one-click sign-in key in the invite email (never shown in the app). */
    signinKeyHash: text("signin_key_hash"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invites_token_hash_key").on(t.tokenHash),
    index("invites_community_idx").on(t.communityId),
    index("invites_space_idx").on(t.spaceId),
  ],
).enableRLS();

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.userId] })],
).enableRLS();

/* ───────────────────────────── Audit ───────────────────────────── */

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_created_idx").on(t.createdAt.desc()),
    index("activity_community_idx").on(t.communityId, t.createdAt.desc()),
    index("activity_action_idx").on(t.actionType, t.createdAt.desc()),
    index("activity_actor_idx").on(t.actorUserId, t.createdAt.desc()),
  ],
).enableRLS();

/* ───────────────────────────── Curriculum (Phase 2) ───────────────────────────── */

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    /** Whatever the space calls it: "Frontend", "QA", "Data Analysis"... */
    title: text("title").notNull(),
    description: text("description"),
    /**
     * Optional entry requirement, e.g. Fullstack requires Frontend at INTERMEDIATE.
     * Enforced by a DB trigger when an enrolment is created.
     */
    prerequisiteTrackId: uuid("prerequisite_track_id"),
    prerequisiteTier: levelTier("prerequisite_tier"),
    /** The practical part of the placement test (markdown brief). Null = no placement test offered. */
    placementTaskMd: text("placement_task_md"),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tracks_space_slug_key").on(t.spaceId, t.slug),
    foreignKey({ columns: [t.prerequisiteTrackId], foreignColumns: [t.id], name: "tracks_prerequisite_fk" }).onDelete("set null"),
    check("tracks_prerequisite_pair", sql`(${t.prerequisiteTrackId} IS NULL) = (${t.prerequisiteTier} IS NULL)`),
    check("tracks_prerequisite_not_self", sql`${t.prerequisiteTrackId} IS NULL OR ${t.prerequisiteTrackId} <> ${t.id}`),
  ],
).enableRLS();

export const levels = pgTable(
  "levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    tier: levelTier("tier").notNull(),
    /** Display name chosen by the space ("Beginner", "Foundations"...). */
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("levels_track_tier_key").on(t.trackId, t.tier)],
).enableRLS();

/**
 * A "pick one" inside a level, e.g. Frontend Intermediate → "React + Next.js" or "Vue + Nuxt".
 * Modules with branchId null are the shared core everyone takes first.
 */
export const trackBranches = pgTable(
  "track_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("track_branches_level_slug_key").on(t.levelId, t.slug),
    // Target for composite FKs that keep a branch inside its own level.
    unique("track_branches_id_level_key").on(t.id, t.levelId),
  ],
).enableRLS();

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    /**
     * The module's capstone project brief. Required to publish: every module ends
     * in a project the learner builds and a mentor reviews.
     */
    projectBriefMd: text("project_brief_md"),
    /** Null = core module for everyone in the level; set = only for learners who chose that branch. */
    branchId: uuid("branch_id"),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("modules_level_idx").on(t.levelId, t.position),
    // A module's branch must belong to the module's own level.
    foreignKey({
      columns: [t.branchId, t.levelId],
      foreignColumns: [trackBranches.id, trackBranches.levelId],
      name: "modules_branch_same_level_fk",
    }).onDelete("cascade"),
  ],
).enableRLS();

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    type: resourceType("type").notNull(),
    title: text("title").notNull(),
    /** Canonical https URL. For YouTube/Drive it is rebuilt from `providerId`, never stored as pasted. */
    url: text("url").notNull(),
    /** Set for VIDEO only. */
    provider: videoProvider("provider"),
    /** YouTube video id or Google Drive file id, parsed and validated on the server (lib/video.ts). */
    providerId: text("provider_id"),
    /** Credit to the creator: YouTube channel, Drive owner or site name. */
    sourceName: text("source_name"),
    estMinutes: integer("est_minutes"),
    /** Video length, required for VIDEO so the server can cap credited watch time. */
    durationSeconds: integer("duration_seconds"),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("resources_module_idx").on(t.moduleId, t.position),
    check("resources_video_has_source", sql`${t.type} <> 'VIDEO' OR (${t.provider} IS NOT NULL AND ${t.durationSeconds} > 0)`),
    check("resources_youtube_id", sql`${t.provider} IS DISTINCT FROM 'YOUTUBE' OR ${t.providerId} ~ '^[A-Za-z0-9_-]{11}$'`),
    check("resources_drive_id", sql`${t.provider} IS DISTINCT FROM 'GOOGLE_DRIVE' OR ${t.providerId} ~ '^[A-Za-z0-9_-]{20,}$'`),
    check("resources_article_plain", sql`${t.type} <> 'ARTICLE' OR (${t.provider} IS NULL AND ${t.providerId} IS NULL)`),
    check("resources_url_https", sql`${t.url} ~ '^https://'`),
  ],
).enableRLS();

export const resourceProgress = pgTable(
  "resource_progress",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    watchedPct: smallint("watched_pct").notNull().default(0),
    /**
     * Seconds of playback the SERVER has credited. Each heartbeat can add at most the
     * wall-clock time since the previous one (times a playback-rate cap), so seeking to
     * the end or forging a "100%" request doesn't complete a video.
     */
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    lastPositionSeconds: integer("last_position_seconds").notNull().default(0),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.userId] })],
).enableRLS();

/**
 * Checkpoint assessments inside a module. A checkpoint opens after the learner
 * finishes `afterResourceId` (or straight away if null) and must be passed to go on.
 */
export const checkpoints = pgTable(
  "checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    afterResourceId: uuid("after_resource_id").references(() => resources.id, { onDelete: "set null" }),
    passThreshold: smallint("pass_threshold").notNull().default(80),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("checkpoints_module_idx").on(t.moduleId, t.position)],
).enableRLS();

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkpointId: uuid("checkpoint_id")
      .notNull()
      .references(() => checkpoints.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    codeSnippet: text("code_snippet"),
    options: jsonb("options").$type<string[]>().notNull(),
    /** Never sent to members: grading happens on the server. */
    correctOptionIndex: smallint("correct_option_index").notNull(),
    explanation: text("explanation"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("quiz_questions_checkpoint_idx").on(t.checkpointId, t.position)],
).enableRLS();

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkpointId: uuid("checkpoint_id")
      .notNull()
      .references(() => checkpoints.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scorePct: smallint("score_pct").notNull(),
    passed: boolean("passed").notNull(),
    answers: jsonb("answers").$type<number[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quiz_attempts_user_checkpoint_idx").on(t.userId, t.checkpointId, t.createdAt.desc())],
).enableRLS();

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoUrl: text("repo_url").notNull(),
    liveUrl: text("live_url"),
    notes: text("notes"),
    status: submissionStatus("status").notNull().default("PENDING"),
    /** Latest mentor score, 0–100 (full history in submission_reviews). */
    score: smallint("score"),
    mentorFeedback: text("mentor_feedback"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("submissions_space_status_idx").on(t.spaceId, t.status, t.createdAt),
    index("submissions_user_module_idx").on(t.userId, t.moduleId),
    // At most one submission waiting for review per learner and module (stops double-submits).
    uniqueIndex("submissions_one_pending_key").on(t.userId, t.moduleId).where(sql`${t.status} = 'PENDING'`),
  ],
).enableRLS();

/**
 * Append-only review history. A mentor (or above) approves or requests revisions and
 * scores the project against the module brief. A DB trigger refuses self-review.
 */
export const submissionReviews = pgTable(
  "submission_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decision: submissionStatus("decision").notNull(),
    score: smallint("score"),
    feedback: text("feedback").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("submission_reviews_submission_idx").on(t.submissionId, t.createdAt.desc()),
    check("submission_reviews_score_range", sql`${t.score} IS NULL OR ${t.score} BETWEEN 0 AND 100`),
    check("submission_reviews_decision", sql`${t.decision} <> 'PENDING'`),
  ],
).enableRLS();

/* ───────────────────────────── Enrolment, intake & placement ───────────────────────────── */

/**
 * A learner's place in a track. The level lives HERE, per track: Intermediate in
 * Frontend says nothing about Backend. DB rules (0001_integrity_rules.sql):
 *  - a new enrolment starts at BEGINNER; the tier only moves through level_promotions
 *  - the FIRST enrolment in a space is the learner's own pick; any further one needs
 *    approvedById = a Mentor or Lead of the space (not the learner)
 *  - the track's prerequisite (e.g. Frontend ≥ INTERMEDIATE for Fullstack) must be met
 */
export const trackEnrollments = pgTable(
  "track_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: levelTier("tier").notNull().default("BEGINNER"),
    status: enrollmentStatus("status").notNull().default("ACTIVE"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvalNote: text("approval_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("track_enrollments_track_user_key").on(t.trackId, t.userId),
    index("track_enrollments_member_idx").on(t.spaceId, t.userId),
    unique("track_enrollments_id_track_key").on(t.id, t.trackId),
    check("track_enrollments_not_self_approved", sql`${t.approvedById} IS NULL OR ${t.approvedById} <> ${t.userId}`),
  ],
).enableRLS();

/**
 * Which branch a learner picked in a level. Free to change until they have progress in
 * the chosen branch; after that only a Mentor or Lead can switch it (DB trigger).
 */
export const enrollmentBranches = pgTable(
  "enrollment_branches",
  {
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => trackEnrollments.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chosenById: uuid("chosen_by_id").references(() => users.id, { onDelete: "set null" }),
    chosenAt: timestamp("chosen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.enrollmentId, t.levelId] }),
    foreignKey({
      columns: [t.branchId, t.levelId],
      foreignColumns: [trackBranches.id, trackBranches.levelId],
      name: "enrollment_branches_same_level_fk",
    }).onDelete("cascade"),
  ],
).enableRLS();

/**
 * Append-only history of level changes within a track (who promoted whom, from → to, why).
 * Only a Mentor or Lead of the space may be promotedById (checked by trigger).
 * placementAttemptId is set when the promotion follows a RECOMMENDED placement test;
 * modules below that level are then "placed out" and earn no points.
 */
export const levelPromotions = pgTable(
  "level_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull(),
    trackId: uuid("track_id").notNull(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromLevel: levelTier("from_level").notNull(),
    toLevel: levelTier("to_level").notNull(),
    promotedById: uuid("promoted_by_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    placementAttemptId: uuid("placement_attempt_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("level_promotions_member_idx").on(t.spaceId, t.userId, t.createdAt.desc()),
    foreignKey({
      columns: [t.enrollmentId, t.trackId],
      foreignColumns: [trackEnrollments.id, trackEnrollments.trackId],
      name: "level_promotions_enrollment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.placementAttemptId],
      foreignColumns: [placementAttempts.id],
      name: "level_promotions_placement_fk",
    }).onDelete("set null"),
    check("level_promotions_not_self", sql`${t.promotedById} IS NULL OR ${t.promotedById} <> ${t.userId}`),
    check("level_promotions_one_step", sql`(${t.fromLevel} = 'BEGINNER' AND ${t.toLevel} = 'INTERMEDIATE') OR (${t.fromLevel} = 'INTERMEDIATE' AND ${t.toLevel} = 'ADVANCED')`),
  ],
).enableRLS();

/**
 * Onboarding answers when a learner joins a space. Generic on purpose (every space
 * asks the same four things); it picks the starting track, never the level.
 * Mentors read it to get to know the learner.
 */
export const spaceIntakes = pgTable(
  "space_intakes",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    goalTrackId: uuid("goal_track_id").references(() => tracks.id, { onDelete: "set null" }),
    /** "What have you built or studied so far?" */
    experience: text("experience").notNull(),
    /** GitHub, portfolio, past projects (https only, validated on the server). */
    links: jsonb("links").$type<string[]>().notNull().default([]),
    hoursPerWeek: smallint("hours_per_week").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    check("space_intakes_hours", sql`${t.hoursPerWeek} BETWEEN 1 AND 80`),
  ],
).enableRLS();

/** Question bank for a track's placement quiz. Each attempt draws a random subset. */
export const placementQuestions = pgTable(
  "placement_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    codeSnippet: text("code_snippet"),
    options: jsonb("options").$type<string[]>().notNull(),
    /** Never sent to members: grading happens on the server. */
    correctOptionIndex: smallint("correct_option_index").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("placement_questions_track_idx").on(t.trackId)],
).enableRLS();

/**
 * One placement test: timed quiz → practical task → mentor review.
 * DB rules: one attempt per track every 30 days; it can only aim at INTERMEDIATE
 * (Advanced needs a mentor conversation); nobody reviews their own attempt.
 * RECOMMENDED does not change the level: a Mentor or Lead records the promotion.
 */
export const placementAttempts = pgTable(
  "placement_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetTier: levelTier("target_tier").notNull().default("INTERMEDIATE"),
    status: placementStatus("status").notNull().default("QUIZ"),
    /** The questions this attempt was served, in order (drawn on the server). */
    questionIds: jsonb("question_ids").$type<string[]>().notNull(),
    answers: jsonb("answers").$type<number[]>(),
    quizScorePct: smallint("quiz_score_pct"),
    quizDeadlineAt: timestamp("quiz_deadline_at", { withTimezone: true }).notNull(),
    taskRepoUrl: text("task_repo_url"),
    taskLiveUrl: text("task_live_url"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewFeedback: text("review_feedback"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("placement_attempts_member_idx").on(t.trackId, t.userId, t.startedAt.desc()),
    index("placement_attempts_review_idx").on(t.spaceId, t.status),
    check("placement_attempts_target", sql`${t.targetTier} = 'INTERMEDIATE'`),
    check("placement_attempts_not_self_review", sql`${t.reviewerId} IS NULL OR ${t.reviewerId} <> ${t.userId}`),
    check("placement_attempts_score_range", sql`${t.quizScorePct} IS NULL OR ${t.quizScorePct} BETWEEN 0 AND 100`),
    check(
      "placement_attempts_reviewed",
      sql`${t.status} NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED') OR (${t.reviewerId} IS NOT NULL AND ${t.reviewFeedback} IS NOT NULL)`,
    ),
  ],
).enableRLS();

/* ───────────────────────────── Accountability (Phase 3) ───────────────────────────── */

export const standups = pgTable(
  "standups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => modules.id, { onDelete: "set null" }),
    didToday: text("did_today").notNull(),
    nextStep: text("next_step").notNull(),
    blockers: text("blockers"),
    /** Calendar day in the community's timezone; one standup per user per space per day. */
    localDate: date("local_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("standups_daily_key").on(t.spaceId, t.userId, t.localDate)],
).enableRLS();

export const feedItems = pgTable(
  "feed_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: feedKind("kind").notNull(),
    refId: uuid("ref_id"),
    /** Small display facts that aren't worth a join, e.g. { days: 7 } for a streak milestone. */
    meta: jsonb("meta").$type<Record<string, string | number>>().notNull().default({}),
    helpNeeded: boolean("help_needed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("feed_items_space_idx").on(t.spaceId, t.createdAt.desc())],
).enableRLS();

export const feedReactions = pgTable(
  "feed_reactions",
  {
    feedItemId: uuid("feed_item_id")
      .notNull()
      .references(() => feedItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.feedItemId, t.userId, t.emoji] })],
).enableRLS();

export const feedComments = pgTable(
  "feed_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedItemId: uuid("feed_item_id")
      .notNull()
      .references(() => feedItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("feed_comments_item_idx").on(t.feedItemId, t.createdAt)],
).enableRLS();

export const streaks = pgTable(
  "streaks",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    current: integer("current").notNull().default(0),
    longest: integer("longest").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
).enableRLS();

/**
 * Append-only. Never UPDATE or DELETE; correct mistakes with an ADJUSTMENT row.
 * `dedupeKey` makes each award idempotent, e.g. `quiz:<moduleId>` or `standup:2026-11-23`.
 */
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    delta: integer("delta").notNull(),
    reason: pointsReason("reason").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("points_dedupe_key").on(t.spaceId, t.userId, t.dedupeKey),
    index("points_space_time_idx").on(t.spaceId, t.createdAt),
    index("points_user_idx").on(t.userId, t.createdAt),
  ],
).enableRLS();

/**
 * Leaderboards are published twice a day at fixed times for everyone (lib/leaderboard.ts),
 * by lenigo_snapshot_leaderboards() run from pg_cron. Every learner-facing total and rank
 * reads the latest snapshot, never the live ledger, so single actions can't be priced.
 */
export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    rank: integer("rank").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("leaderboard_snapshots_key").on(t.spaceId, t.userId, t.takenAt),
    index("leaderboard_snapshots_board_idx").on(t.spaceId, t.takenAt.desc(), t.rank),
  ],
).enableRLS();

/* ───────────────────────────── Workshops (Phase 4) ───────────────────────────── */

export const workshops = pgTable(
  "workshops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: workshopKind("kind").notNull().default("WORKSHOP"),
    type: workshopType("type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    meetingUrl: text("meeting_url"),
    venue: text("venue"),
    agendaMd: text("agenda_md"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("workshops_space_time_idx").on(t.spaceId, t.startsAt)],
).enableRLS();

export const workshopRsvps = pgTable(
  "workshop_rsvps",
  {
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => workshops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    /** Marked by a mentor or above, never by the attendee. */
    attended: boolean("attended").notNull().default(false),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    markedById: uuid("marked_by_id").references(() => users.id, { onDelete: "set null" }),
    /** When the "starts soon" reminder email went out (sent once). */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workshopId, t.userId] })],
).enableRLS();

/* ───────────────────────── Community requests ───────────────────── */

export const communityRequestStatus = pgEnum("community_request_status", ["NEW", "CONTACTED", "PROVISIONED", "DECLINED"]);

/**
 * "Bring your community" form on the landing page. Public, so it's rate-limited by a salted hash
 * of the sender's IP (the IP itself isn't stored) and by email. Super Admins and Admins follow up
 * from Global House → Requests.
 */
export const communityRequests = pgTable(
  "community_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    communityName: text("community_name").notNull(),
    size: text("size").notNull(),
    location: text("location"),
    about: text("about").notNull(),
    link: text("link"),
    ipHash: text("ip_hash"),
    status: communityRequestStatus("status").notNull().default("NEW"),
    handledById: uuid("handled_by_id").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("community_requests_created_idx").on(t.createdAt.desc()),
    index("community_requests_ip_idx").on(t.ipHash, t.createdAt),
    index("community_requests_email_idx").on(sql`lower(${t.email})`, t.createdAt),
  ],
).enableRLS();

/* ───────────────────────────── Types ───────────────────────────── */

export type User = typeof users.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type GlobalRole = (typeof globalRole.enumValues)[number];
export type CommunityRole = (typeof communityRole.enumValues)[number];
export type SpaceRole = (typeof spaceRole.enumValues)[number];
export type LevelTier = (typeof levelTier.enumValues)[number];
export type Track = typeof tracks.$inferSelect;
export type TrackEnrollment = typeof trackEnrollments.$inferSelect;
export type PlacementStatus = (typeof placementStatus.enumValues)[number];
export type PointsReason = (typeof pointsReason.enumValues)[number];
