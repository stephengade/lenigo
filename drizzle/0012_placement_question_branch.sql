ALTER TABLE "track_branches" ADD CONSTRAINT "track_branches_id_track_key" UNIQUE("id","track_id");--> statement-breakpoint
ALTER TABLE "placement_questions" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "placement_questions" ADD CONSTRAINT "placement_questions_branch_same_track_fk" FOREIGN KEY ("branch_id","track_id") REFERENCES "public"."track_branches"("id","track_id") ON DELETE cascade ON UPDATE no action;
