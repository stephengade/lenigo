-- Readable curriculum URLs: /learn/<track>/<module>/<lesson-or-quiz>.
-- Columns are added nullable, backfilled from existing titles, then tightened.
ALTER TABLE "modules" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_id_track_key" UNIQUE("id","track_id");--> statement-breakpoint
UPDATE "modules" m SET "track_id" = l."track_id" FROM "levels" l WHERE l."id" = m."level_id";--> statement-breakpoint
-- Module slugs: from the title, unique within the track ("-2", "-3"... for repeats).
WITH base AS (
  SELECT "id", "track_id", "position", "created_at",
    COALESCE(NULLIF(trim(both '-' from left(trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), 48)), ''), 'module') AS b
  FROM "modules"
), ranked AS (
  SELECT "id", b, row_number() OVER (PARTITION BY "track_id", b ORDER BY "position", "created_at", "id") AS n FROM base
)
UPDATE "modules" m SET "slug" = CASE WHEN r.n = 1 THEN r.b ELSE r.b || '-' || r.n END FROM ranked r WHERE r."id" = m."id";--> statement-breakpoint
-- Lesson slugs: unique within the module; "project" is the capstone's page.
WITH base AS (
  SELECT "id", "module_id", "position", "created_at",
    COALESCE(NULLIF(trim(both '-' from left(trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), 48)), ''), 'lesson') AS raw
  FROM "resources"
), fixed AS (
  SELECT "id", "module_id", "position", "created_at", CASE WHEN raw = 'project' THEN 'project-lesson' ELSE raw END AS b FROM base
), ranked AS (
  SELECT "id", b, row_number() OVER (PARTITION BY "module_id", b ORDER BY "position", "created_at", "id") AS n FROM fixed
)
UPDATE "resources" x SET "slug" = CASE WHEN r.n = 1 THEN r.b ELSE r.b || '-' || r.n END FROM ranked r WHERE r."id" = x."id";--> statement-breakpoint
-- Quiz slugs: unique within the module and kept apart from its lesson slugs.
WITH base AS (
  SELECT c."id", c."module_id", c."position", c."created_at",
    COALESCE(NULLIF(trim(both '-' from left(trim(both '-' from regexp_replace(lower(c."title"), '[^a-z0-9]+', '-', 'g')), 48)), ''), 'quiz') AS raw
  FROM "checkpoints" c
), fixed AS (
  SELECT b."id", b."module_id", b."position", b."created_at",
    CASE WHEN b.raw = 'project' OR EXISTS (SELECT 1 FROM "resources" r WHERE r."module_id" = b."module_id" AND r."slug" = b.raw) THEN b.raw || '-quiz' ELSE b.raw END AS b
  FROM base b
), ranked AS (
  SELECT "id", b, row_number() OVER (PARTITION BY "module_id", b ORDER BY "position", "created_at", "id") AS n FROM fixed
)
UPDATE "checkpoints" x SET "slug" = CASE WHEN r.n = 1 THEN r.b ELSE r.b || '-' || r.n END FROM ranked r WHERE r."id" = x."id";--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "track_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_level_same_track_fk" FOREIGN KEY ("level_id","track_id") REFERENCES "public"."levels"("id","track_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_module_slug_key" ON "checkpoints" USING btree ("module_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_track_slug_key" ON "modules" USING btree ("track_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_module_slug_key" ON "resources" USING btree ("module_id","slug");--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_slug_format" CHECK ("checkpoints"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "checkpoints"."slug" <> 'project');--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_slug_format" CHECK ("modules"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_slug_format" CHECK ("resources"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "resources"."slug" <> 'project');
