ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_rsvps" ADD COLUMN "reminded_at" timestamp with time zone;