CREATE TYPE "public"."community_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."feed_kind" AS ENUM('STANDUP', 'CHECKPOINT_PASSED', 'PROJECT_APPROVED', 'LEVEL_PROMOTED', 'STREAK_MILESTONE');--> statement-breakpoint
CREATE TYPE "public"."global_role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'VIEWER', 'USER');--> statement-breakpoint
CREATE TYPE "public"."join_policy" AS ENUM('OPEN', 'INVITE');--> statement-breakpoint
CREATE TYPE "public"."level_tier" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('QUIZ', 'TASK', 'AWAITING_REVIEW', 'RECOMMENDED', 'NOT_RECOMMENDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."points_reason" AS ENUM('STANDUP', 'VIDEO_COMPLETED', 'CHECKPOINT_PASSED', 'PROJECT_APPROVED', 'REVIEW_SESSION_ATTENDED', 'WORKSHOP_ATTENDED', 'STREAK_BONUS', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('VIDEO', 'ARTICLE');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('LEAD', 'MANAGER', 'MENTOR', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('PENDING', 'APPROVED', 'NEEDS_REVISION');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."video_provider" AS ENUM('YOUTUBE', 'GOOGLE_DRIVE', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."workshop_kind" AS ENUM('WORKSHOP', 'STANDUP_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."workshop_type" AS ENUM('ONLINE_CALL', 'PHYSICAL');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"community_id" uuid,
	"space_id" uuid,
	"action_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"after_resource_id" uuid,
	"pass_threshold" smallint DEFAULT 80 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"accent" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "tenant_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "community_members" (
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "community_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "community_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment_branches" (
	"enrollment_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chosen_by_id" uuid,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_branches_enrollment_id_level_id_pk" PRIMARY KEY("enrollment_id","level_id")
);
--> statement-breakpoint
ALTER TABLE "enrollment_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feed_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"kind" "feed_kind" NOT NULL,
	"ref_id" uuid,
	"help_needed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feed_reactions" (
	"feed_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_reactions_feed_item_id_user_id_emoji_pk" PRIMARY KEY("feed_item_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "feed_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"invite_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_redemptions_invite_id_user_id_pk" PRIMARY KEY("invite_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "invite_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"community_id" uuid NOT NULL,
	"space_id" uuid,
	"community_role" "community_role",
	"space_role" "space_role",
	"email" text,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"rank" integer NOT NULL,
	"taken_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "level_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_level" "level_tier" NOT NULL,
	"to_level" "level_tier" NOT NULL,
	"promoted_by_id" uuid,
	"reason" text NOT NULL,
	"placement_attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_promotions_not_self" CHECK ("level_promotions"."promoted_by_id" IS NULL OR "level_promotions"."promoted_by_id" <> "level_promotions"."user_id"),
	CONSTRAINT "level_promotions_one_step" CHECK (("level_promotions"."from_level" = 'BEGINNER' AND "level_promotions"."to_level" = 'INTERMEDIATE') OR ("level_promotions"."from_level" = 'INTERMEDIATE' AND "level_promotions"."to_level" = 'ADVANCED'))
);
--> statement-breakpoint
ALTER TABLE "level_promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"tier" "level_tier" NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"project_brief_md" text,
	"branch_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "placement_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"target_tier" "level_tier" DEFAULT 'INTERMEDIATE' NOT NULL,
	"status" "placement_status" DEFAULT 'QUIZ' NOT NULL,
	"question_ids" jsonb NOT NULL,
	"answers" jsonb,
	"quiz_score_pct" smallint,
	"quiz_deadline_at" timestamp with time zone NOT NULL,
	"task_repo_url" text,
	"task_live_url" text,
	"reviewer_id" uuid,
	"review_feedback" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "placement_attempts_target" CHECK ("placement_attempts"."target_tier" = 'INTERMEDIATE'),
	CONSTRAINT "placement_attempts_not_self_review" CHECK ("placement_attempts"."reviewer_id" IS NULL OR "placement_attempts"."reviewer_id" <> "placement_attempts"."user_id"),
	CONSTRAINT "placement_attempts_score_range" CHECK ("placement_attempts"."quiz_score_pct" IS NULL OR "placement_attempts"."quiz_score_pct" BETWEEN 0 AND 100),
	CONSTRAINT "placement_attempts_reviewed" CHECK ("placement_attempts"."status" NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED') OR ("placement_attempts"."reviewer_id" IS NOT NULL AND "placement_attempts"."review_feedback" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "placement_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "placement_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"code_snippet" text,
	"options" jsonb NOT NULL,
	"correct_option_index" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placement_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"track_id" uuid,
	"delta" integer NOT NULL,
	"reason" "points_reason" NOT NULL,
	"dedupe_key" text NOT NULL,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "points_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score_pct" smallint NOT NULL,
	"passed" boolean NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"code_snippet" text,
	"options" jsonb NOT NULL,
	"correct_option_index" smallint NOT NULL,
	"explanation" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resource_progress" (
	"resource_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"watched_pct" smallint DEFAULT 0 NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"last_position_seconds" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_progress_resource_id_user_id_pk" PRIMARY KEY("resource_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "resource_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"provider" "video_provider",
	"provider_id" text,
	"source_name" text,
	"est_minutes" integer,
	"duration_seconds" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_video_has_source" CHECK ("resources"."type" <> 'VIDEO' OR ("resources"."provider" IS NOT NULL AND "resources"."duration_seconds" > 0)),
	CONSTRAINT "resources_youtube_id" CHECK ("resources"."provider" IS DISTINCT FROM 'YOUTUBE' OR "resources"."provider_id" ~ '^[A-Za-z0-9_-]{11}$'),
	CONSTRAINT "resources_drive_id" CHECK ("resources"."provider" IS DISTINCT FROM 'GOOGLE_DRIVE' OR "resources"."provider_id" ~ '^[A-Za-z0-9_-]{20,}$'),
	CONSTRAINT "resources_article_plain" CHECK ("resources"."type" <> 'ARTICLE' OR ("resources"."provider" IS NULL AND "resources"."provider_id" IS NULL)),
	CONSTRAINT "resources_url_https" CHECK ("resources"."url" ~ '^https://')
);
--> statement-breakpoint
ALTER TABLE "resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_intakes" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"goal_track_id" uuid,
	"experience" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hours_per_week" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_intakes_space_id_user_id_pk" PRIMARY KEY("space_id","user_id"),
	CONSTRAINT "space_intakes_hours" CHECK ("space_intakes"."hours_per_week" BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "space_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"role" "space_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "space_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"accent" text,
	"join_policy" "join_policy" DEFAULT 'OPEN' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "standups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"module_id" uuid,
	"did_today" text NOT NULL,
	"next_step" text NOT NULL,
	"blockers" text,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "streaks" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streaks_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "streaks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submission_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "submission_status" NOT NULL,
	"score" smallint,
	"feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_reviews_score_range" CHECK ("submission_reviews"."score" IS NULL OR "submission_reviews"."score" BETWEEN 0 AND 100),
	CONSTRAINT "submission_reviews_decision" CHECK ("submission_reviews"."decision" <> 'PENDING')
);
--> statement-breakpoint
ALTER TABLE "submission_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"repo_url" text NOT NULL,
	"live_url" text,
	"notes" text,
	"status" "submission_status" DEFAULT 'PENDING' NOT NULL,
	"score" smallint,
	"mentor_feedback" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "track_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_branches_id_level_key" UNIQUE("id","level_id")
);
--> statement-breakpoint
ALTER TABLE "track_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "track_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "level_tier" DEFAULT 'BEGINNER' NOT NULL,
	"status" "enrollment_status" DEFAULT 'ACTIVE' NOT NULL,
	"approved_by_id" uuid,
	"approval_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_enrollments_id_track_key" UNIQUE("id","track_id"),
	CONSTRAINT "track_enrollments_not_self_approved" CHECK ("track_enrollments"."approved_by_id" IS NULL OR "track_enrollments"."approved_by_id" <> "track_enrollments"."user_id")
);
--> statement-breakpoint
ALTER TABLE "track_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"prerequisite_track_id" uuid,
	"prerequisite_tier" "level_tier",
	"placement_task_md" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_prerequisite_pair" CHECK (("tracks"."prerequisite_track_id" IS NULL) = ("tracks"."prerequisite_tier" IS NULL)),
	CONSTRAINT "tracks_prerequisite_not_self" CHECK ("tracks"."prerequisite_track_id" IS NULL OR "tracks"."prerequisite_track_id" <> "tracks"."id")
);
--> statement-breakpoint
ALTER TABLE "tracks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"github_username" text,
	"username" text,
	"bio" text,
	"global_role" "global_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_rsvps" (
	"workshop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"submission_id" uuid,
	"attended" boolean DEFAULT false NOT NULL,
	"attended_at" timestamp with time zone,
	"marked_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_rsvps_workshop_id_user_id_pk" PRIMARY KEY("workshop_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "workshop_kind" DEFAULT 'WORKSHOP' NOT NULL,
	"type" "workshop_type" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"meeting_url" text,
	"venue" text,
	"agenda_md" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workshops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_after_resource_id_resources_id_fk" FOREIGN KEY ("after_resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_branches" ADD CONSTRAINT "enrollment_branches_enrollment_id_track_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."track_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_branches" ADD CONSTRAINT "enrollment_branches_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_branches" ADD CONSTRAINT "enrollment_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_branches" ADD CONSTRAINT "enrollment_branches_chosen_by_id_users_id_fk" FOREIGN KEY ("chosen_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_branches" ADD CONSTRAINT "enrollment_branches_same_level_fk" FOREIGN KEY ("branch_id","level_id") REFERENCES "public"."track_branches"("id","level_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_comments" ADD CONSTRAINT "feed_comments_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_comments" ADD CONSTRAINT "feed_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_promoted_by_id_users_id_fk" FOREIGN KEY ("promoted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_enrollment_fk" FOREIGN KEY ("enrollment_id","track_id") REFERENCES "public"."track_enrollments"("id","track_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_promotions" ADD CONSTRAINT "level_promotions_placement_fk" FOREIGN KEY ("placement_attempt_id") REFERENCES "public"."placement_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_branch_same_level_fk" FOREIGN KEY ("branch_id","level_id") REFERENCES "public"."track_branches"("id","level_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempts" ADD CONSTRAINT "placement_attempts_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempts" ADD CONSTRAINT "placement_attempts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempts" ADD CONSTRAINT "placement_attempts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempts" ADD CONSTRAINT "placement_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempts" ADD CONSTRAINT "placement_attempts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_questions" ADD CONSTRAINT "placement_questions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_questions" ADD CONSTRAINT "placement_questions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_progress" ADD CONSTRAINT "resource_progress_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_progress" ADD CONSTRAINT "resource_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_progress" ADD CONSTRAINT "resource_progress_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_intakes" ADD CONSTRAINT "space_intakes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_intakes" ADD CONSTRAINT "space_intakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_intakes" ADD CONSTRAINT "space_intakes_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_intakes" ADD CONSTRAINT "space_intakes_goal_track_id_tracks_id_fk" FOREIGN KEY ("goal_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standups" ADD CONSTRAINT "standups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standups" ADD CONSTRAINT "standups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standups" ADD CONSTRAINT "standups_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_branches" ADD CONSTRAINT "track_branches_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_branches" ADD CONSTRAINT "track_branches_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_branches" ADD CONSTRAINT "track_branches_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrollments" ADD CONSTRAINT "track_enrollments_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrollments" ADD CONSTRAINT "track_enrollments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrollments" ADD CONSTRAINT "track_enrollments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrollments" ADD CONSTRAINT "track_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrollments" ADD CONSTRAINT "track_enrollments_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_prerequisite_fk" FOREIGN KEY ("prerequisite_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_community_idx" ON "activity_logs" USING btree ("community_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_action_idx" ON "activity_logs" USING btree ("action_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_actor_idx" ON "activity_logs" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "checkpoints_module_idx" ON "checkpoints" USING btree ("module_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "communities_slug_key" ON "communities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "community_members_user_idx" ON "community_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_comments_item_idx" ON "feed_comments" USING btree ("feed_item_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_items_space_idx" ON "feed_items" USING btree ("space_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_community_idx" ON "invites" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "invites_space_idx" ON "invites" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_key" ON "leaderboard_snapshots" USING btree ("space_id","user_id","taken_at");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_board_idx" ON "leaderboard_snapshots" USING btree ("space_id","taken_at" DESC NULLS LAST,"rank");--> statement-breakpoint
CREATE INDEX "level_promotions_member_idx" ON "level_promotions" USING btree ("space_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "levels_track_tier_key" ON "levels" USING btree ("track_id","tier");--> statement-breakpoint
CREATE INDEX "modules_level_idx" ON "modules" USING btree ("level_id","position");--> statement-breakpoint
CREATE INDEX "placement_attempts_member_idx" ON "placement_attempts" USING btree ("track_id","user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "placement_attempts_review_idx" ON "placement_attempts" USING btree ("space_id","status");--> statement-breakpoint
CREATE INDEX "placement_questions_track_idx" ON "placement_questions" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "points_dedupe_key" ON "points_ledger" USING btree ("space_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "points_space_time_idx" ON "points_ledger" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "points_user_idx" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_checkpoint_idx" ON "quiz_attempts" USING btree ("user_id","checkpoint_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quiz_questions_checkpoint_idx" ON "quiz_questions" USING btree ("checkpoint_id","position");--> statement-breakpoint
CREATE INDEX "resources_module_idx" ON "resources" USING btree ("module_id","position");--> statement-breakpoint
CREATE INDEX "space_members_user_idx" ON "space_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "space_members_community_idx" ON "space_members" USING btree ("community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_community_slug_key" ON "spaces" USING btree ("community_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "standups_daily_key" ON "standups" USING btree ("space_id","user_id","local_date");--> statement-breakpoint
CREATE INDEX "submission_reviews_submission_idx" ON "submission_reviews" USING btree ("submission_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_space_status_idx" ON "submissions" USING btree ("space_id","status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_user_module_idx" ON "submissions" USING btree ("user_id","module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "track_branches_level_slug_key" ON "track_branches" USING btree ("level_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "track_enrollments_track_user_key" ON "track_enrollments" USING btree ("track_id","user_id");--> statement-breakpoint
CREATE INDEX "track_enrollments_member_idx" ON "track_enrollments" USING btree ("space_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_space_slug_key" ON "tracks" USING btree ("space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_key" ON "users" USING btree (lower("github_username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "workshops_space_time_idx" ON "workshops" USING btree ("space_id","starts_at");