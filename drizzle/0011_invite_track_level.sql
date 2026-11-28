ALTER TABLE "invites" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "tier" "level_tier";--> statement-breakpoint
ALTER TABLE "level_promotions" ADD COLUMN "via_invite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_track_with_tier" CHECK (("invites"."track_id" IS NULL) = ("invites"."tier" IS NULL));--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_track_learners_only" CHECK ("invites"."track_id" IS NULL OR "invites"."space_role" = 'MEMBER');