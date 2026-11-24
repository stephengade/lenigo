CREATE TYPE "public"."community_request_status" AS ENUM('NEW', 'CONTACTED', 'PROVISIONED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "community_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"community_name" text NOT NULL,
	"size" text NOT NULL,
	"location" text,
	"about" text NOT NULL,
	"link" text,
	"ip_hash" text,
	"status" "community_request_status" DEFAULT 'NEW' NOT NULL,
	"handled_by_id" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "community_requests" ADD CONSTRAINT "community_requests_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_requests_created_idx" ON "community_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "community_requests_ip_idx" ON "community_requests" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "community_requests_email_idx" ON "community_requests" USING btree (lower("email"),"created_at");