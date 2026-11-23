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
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
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
export const levelTier = pgEnum("level_tier", ["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export const resourceType = pgEnum("resource_type", ["VIDEO", "ARTICLE", "SANDBOX"]);
export const submissionStatus = pgEnum("submission_status", ["PENDING", "APPROVED", "NEEDS_REVISION"]);
export const workshopType = pgEnum("workshop_type", ["ONLINE_CALL", "PHYSICAL"]);
export const pointsReason = pgEnum("points_reason", [
  "STANDUP",
  "RESOURCE_COMPLETED",
  "QUIZ_PASSED",
  "PROJECT_APPROVED",
  "WORKSHOP_ATTENDED",
  "STREAK_BONUS",
  "ADJUSTMENT",
]);
export const feedKind = pgEnum("feed_kind", ["STANDUP", "QUIZ_PASSED", "PROJECT_APPROVED", "STREAK_MILESTONE"]);

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
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tracks_space_slug_key").on(t.spaceId, t.slug)],
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
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("levels_track_tier_key").on(t.trackId, t.tier)],
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
    actionItemMd: text("action_item_md"),
    passThreshold: smallint("pass_threshold").notNull().default(80),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("modules_level_idx").on(t.levelId, t.position)],
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
    url: text("url").notNull(),
    estMinutes: integer("est_minutes"),
    position: integer("position").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("resources_module_idx").on(t.moduleId, t.position)],
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
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.userId] })],
).enableRLS();

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    codeSnippet: text("code_snippet"),
    options: jsonb("options").$type<string[]>().notNull(),
    correctOptionIndex: smallint("correct_option_index").notNull(),
    explanation: text("explanation"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("quiz_questions_module_idx").on(t.moduleId, t.position)],
).enableRLS();

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  (t) => [index("quiz_attempts_user_module_idx").on(t.userId, t.moduleId, t.createdAt.desc())],
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
    mentorFeedback: text("mentor_feedback"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("submissions_space_status_idx").on(t.spaceId, t.status, t.createdAt),
    index("submissions_user_module_idx").on(t.userId, t.moduleId),
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

/* ───────────────────────────── Workshops (Phase 4) ───────────────────────────── */

export const workshops = pgTable(
  "workshops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
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
    attended: boolean("attended").notNull().default(false),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workshopId, t.userId] })],
).enableRLS();

/* ───────────────────────────── Types ───────────────────────────── */

export type User = typeof users.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type GlobalRole = (typeof globalRole.enumValues)[number];
export type CommunityRole = (typeof communityRole.enumValues)[number];
export type SpaceRole = (typeof spaceRole.enumValues)[number];
