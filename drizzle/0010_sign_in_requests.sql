CREATE TABLE "sign_in_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_in_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "sign_in_requests_key_idx" ON "sign_in_requests" USING btree ("key","created_at");