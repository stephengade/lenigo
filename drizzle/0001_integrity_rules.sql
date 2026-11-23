-- Integrity rules the app must not be able to bypass, even with a bug in a service.
-- The app connects as the table owner, so these triggers are the last line of defence.

-- 1. Append-only tables ------------------------------------------------------------
-- UPDATE is always refused. DELETE stays possible only through ON DELETE CASCADE /
-- SET NULL (e.g. a Super Admin deleting a whole community), never as a direct edit.
CREATE OR REPLACE FUNCTION lenigo_refuse_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Allow FK actions (SET NULL when a user/community is deleted); refuse everything else.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only; write a new row instead (e.g. an ADJUSTMENT)', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER points_ledger_append_only BEFORE UPDATE ON "points_ledger"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint
CREATE TRIGGER activity_logs_append_only BEFORE UPDATE ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint
CREATE TRIGGER level_promotions_append_only BEFORE UPDATE ON "level_promotions"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint
CREATE TRIGGER submission_reviews_append_only BEFORE UPDATE ON "submission_reviews"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint
CREATE TRIGGER quiz_attempts_append_only BEFORE UPDATE ON "quiz_attempts"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint

-- 2. Tracks, levels and placement ------------------------------------------------------
-- Helper: a user's role in a space, or NULL if they aren't a member.
CREATE OR REPLACE FUNCTION lenigo_space_role(p_space uuid, p_user uuid) RETURNS space_role
LANGUAGE sql STABLE AS $$
  SELECT role FROM space_members WHERE space_id = p_space AND user_id = p_user
$$;
--> statement-breakpoint

-- 2a. A level (tier) only moves through a promotion.
-- New enrolments start at BEGINNER. Changing the tier needs a level_promotions row for
-- exactly that change written in the SAME transaction (created_at = now()).
CREATE OR REPLACE FUNCTION lenigo_guard_enrollment_tier() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tier <> 'BEGINNER' THEN
      RAISE EXCEPTION 'a new enrolment starts at BEGINNER; higher levels come only through a promotion';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tier IS NOT DISTINCT FROM OLD.tier THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM level_promotions p
    WHERE p.enrollment_id = NEW.id
      AND p.from_level = OLD.tier
      AND p.to_level = NEW.tier
      AND p.created_at = now()
  ) THEN
    RAISE EXCEPTION 'track_enrollments.tier can only change through a recorded promotion';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER track_enrollments_tier_guard BEFORE INSERT OR UPDATE OF tier ON "track_enrollments"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_enrollment_tier();
--> statement-breakpoint

-- 2b. Who may enrol where.
--  * must be a member of the space; the track must be published and in that space
--  * the track's prerequisite must be met (e.g. Frontend >= INTERMEDIATE for Fullstack)
--  * the first enrolment in a space is the learner's pick; any further one must be
--    approved by a Mentor or Lead of the space
--  * track, learner and approver never change afterwards
CREATE OR REPLACE FUNCTION lenigo_guard_enrollment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t tracks%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN NEW;
    END IF;
    IF NEW.track_id <> OLD.track_id OR NEW.user_id <> OLD.user_id OR NEW.space_id <> OLD.space_id
       OR NEW.community_id <> OLD.community_id
       OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id THEN
      RAISE EXCEPTION 'an enrolment''s track, learner and approver cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM tracks WHERE id = NEW.track_id;
  IF t.space_id <> NEW.space_id OR t.community_id <> NEW.community_id THEN
    RAISE EXCEPTION 'track does not belong to this space';
  END IF;
  IF NOT t.is_published THEN
    RAISE EXCEPTION 'track is not published';
  END IF;
  IF lenigo_space_role(NEW.space_id, NEW.user_id) IS NULL THEN
    RAISE EXCEPTION 'only members of the space can enrol in its tracks';
  END IF;
  IF t.prerequisite_track_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM track_enrollments e
    WHERE e.track_id = t.prerequisite_track_id AND e.user_id = NEW.user_id AND e.tier >= t.prerequisite_tier
  ) THEN
    RAISE EXCEPTION 'prerequisite not met for this track';
  END IF;
  IF NEW.approved_by_id IS NOT NULL
     AND COALESCE(lenigo_space_role(NEW.space_id, NEW.approved_by_id) IN ('LEAD', 'MENTOR'), false) = false THEN
    RAISE EXCEPTION 'approver must be a Mentor or Lead of this space';
  END IF;
  IF NEW.approved_by_id IS NULL
     AND EXISTS (SELECT 1 FROM track_enrollments e WHERE e.space_id = NEW.space_id AND e.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'joining another track needs approval from a Mentor or Lead';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER track_enrollments_guard BEFORE INSERT OR UPDATE ON "track_enrollments"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_enrollment();
--> statement-breakpoint

-- 2c. Promotions: only a Mentor or Lead of the space, one step up from the learner's
-- CURRENT tier, for the enrolment's own learner. A placement-based promotion needs a
-- RECOMMENDED attempt by the same learner in the same track.
CREATE OR REPLACE FUNCTION lenigo_guard_promotion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  e track_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO e FROM track_enrollments WHERE id = NEW.enrollment_id;
  IF e.user_id <> NEW.user_id OR e.space_id <> NEW.space_id OR e.community_id <> NEW.community_id THEN
    RAISE EXCEPTION 'promotion does not match the enrolment';
  END IF;
  IF e.tier <> NEW.from_level THEN
    RAISE EXCEPTION 'promotion must start from the learner''s current level';
  END IF;
  IF NEW.promoted_by_id IS NULL
     OR COALESCE(lenigo_space_role(NEW.space_id, NEW.promoted_by_id) IN ('LEAD', 'MENTOR'), false) = false THEN
    RAISE EXCEPTION 'only a Mentor or Lead of this space can promote';
  END IF;
  IF NEW.placement_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM placement_attempts a
    WHERE a.id = NEW.placement_attempt_id AND a.user_id = NEW.user_id
      AND a.track_id = NEW.track_id AND a.status = 'RECOMMENDED' AND a.target_tier = NEW.to_level
  ) THEN
    RAISE EXCEPTION 'placement attempt is not a matching recommendation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER level_promotions_guard BEFORE INSERT ON "level_promotions"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_promotion();
--> statement-breakpoint

-- 2d. Branch choice ("pick one" inside a level). The learner picks for themselves;
-- once they have progress or a submission in the chosen branch, only a Mentor or Lead
-- can switch it.
CREATE OR REPLACE FUNCTION lenigo_guard_branch_choice() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  e track_enrollments%ROWTYPE;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO e FROM track_enrollments WHERE id = NEW.enrollment_id;
  IF e.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'branch choice does not match the enrolment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM track_branches b WHERE b.id = NEW.branch_id AND b.track_id = e.track_id) THEN
    RAISE EXCEPTION 'branch belongs to another track';
  END IF;
  IF NEW.chosen_by_id IS NULL THEN
    RAISE EXCEPTION 'chosen_by_id is required';
  END IF;
  IF NEW.chosen_by_id <> NEW.user_id
     AND COALESCE(lenigo_space_role(e.space_id, NEW.chosen_by_id) IN ('LEAD', 'MENTOR'), false) = false THEN
    RAISE EXCEPTION 'only the learner, a Mentor or a Lead can choose a branch';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.enrollment_id <> OLD.enrollment_id OR NEW.level_id <> OLD.level_id OR NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'only the branch can change';
    END IF;
    IF NEW.branch_id <> OLD.branch_id AND NEW.chosen_by_id = NEW.user_id AND (
      EXISTS (
        SELECT 1 FROM resource_progress rp
        JOIN resources r ON r.id = rp.resource_id
        JOIN modules m ON m.id = r.module_id
        WHERE rp.user_id = NEW.user_id AND m.branch_id = OLD.branch_id
      ) OR EXISTS (
        SELECT 1 FROM submissions s
        JOIN modules m ON m.id = s.module_id
        WHERE s.user_id = NEW.user_id AND m.branch_id = OLD.branch_id
      )
    ) THEN
      RAISE EXCEPTION 'you have started this branch; ask a Mentor or Lead to switch it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER enrollment_branches_guard BEFORE INSERT OR UPDATE ON "enrollment_branches"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_branch_choice();
--> statement-breakpoint

-- 2e. Placement tests.
--  INSERT: starts at QUIZ, unscored and unreviewed; the learner is enrolled in the track
--          at BEGINNER; the track offers a test; one attempt per track every 30 days.
--  UPDATE: identity and the served question set are fixed; a reviewer must be a Mentor,
--          Manager or Lead; once reviewed (RECOMMENDED / NOT_RECOMMENDED) it is frozen.
CREATE OR REPLACE FUNCTION lenigo_guard_placement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'QUIZ' OR NEW.reviewer_id IS NOT NULL OR NEW.quiz_score_pct IS NOT NULL THEN
      RAISE EXCEPTION 'a placement attempt starts at the quiz, unscored and unreviewed';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM track_enrollments e
      WHERE e.track_id = NEW.track_id AND e.user_id = NEW.user_id
        AND e.space_id = NEW.space_id AND e.tier = 'BEGINNER'
    ) THEN
      RAISE EXCEPTION 'placement is for learners enrolled at the first level of this track';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tracks t WHERE t.id = NEW.track_id AND t.placement_task_md IS NOT NULL) THEN
      RAISE EXCEPTION 'this track does not offer a placement test';
    END IF;
    IF EXISTS (
      SELECT 1 FROM placement_attempts a
      WHERE a.track_id = NEW.track_id AND a.user_id = NEW.user_id
        AND a.started_at > now() - interval '30 days'
    ) THEN
      RAISE EXCEPTION 'one placement attempt per track every 30 days';
    END IF;
    NEW.started_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status IN ('RECOMMENDED', 'NOT_RECOMMENDED') THEN
    RAISE EXCEPTION 'a reviewed placement attempt cannot be changed';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.track_id <> OLD.track_id OR NEW.space_id <> OLD.space_id
     OR NEW.started_at <> OLD.started_at OR NEW.question_ids <> OLD.question_ids
     OR NEW.quiz_deadline_at <> OLD.quiz_deadline_at OR NEW.target_tier <> OLD.target_tier THEN
    RAISE EXCEPTION 'placement attempt identity and question set cannot be changed';
  END IF;
  IF NEW.reviewer_id IS NOT NULL
     AND COALESCE(lenigo_space_role(NEW.space_id, NEW.reviewer_id) IN ('LEAD', 'MANAGER', 'MENTOR'), false) = false THEN
    RAISE EXCEPTION 'placement must be reviewed by a Mentor or above';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER placement_attempts_guard BEFORE INSERT OR UPDATE ON "placement_attempts"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_placement();
--> statement-breakpoint

-- 3. Nobody reviews or scores their own project -------------------------------------
CREATE OR REPLACE FUNCTION lenigo_refuse_self_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reviewer_id IS NOT NULL AND NEW.reviewer_id = (SELECT user_id FROM submissions WHERE id = NEW.submission_id) THEN
    RAISE EXCEPTION 'reviewers cannot review their own submission';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER submission_reviews_not_self BEFORE INSERT ON "submission_reviews"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_self_review();
--> statement-breakpoint

-- 4. Nobody marks their own attendance ----------------------------------------------
CREATE OR REPLACE FUNCTION lenigo_refuse_self_attendance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- FK action (marker's account deleted → SET NULL) keeps the historical mark.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.attended AND (NEW.marked_by_id IS NULL OR NEW.marked_by_id = NEW.user_id) THEN
    RAISE EXCEPTION 'attendance must be marked by a mentor or above, not the attendee';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workshop_rsvps_attendance_guard BEFORE INSERT OR UPDATE OF attended, marked_by_id ON "workshop_rsvps"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_self_attendance();
--> statement-breakpoint

-- 5. Twice-daily leaderboard snapshots -----------------------------------------------
-- Learners see totals and ranks only from the latest snapshot, never the live ledger.
-- Ranks members (role MEMBER) per space; staff are not ranked. Idempotent per minute.
-- Schedule with pg_cron (README → Setup):
--   select cron.schedule('lenigo-leaderboard', '0 6,18 * * *', 'select lenigo_snapshot_leaderboards()');
CREATE OR REPLACE FUNCTION lenigo_snapshot_leaderboards() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  taken timestamptz := date_trunc('minute', now());
  inserted integer;
BEGIN
  INSERT INTO leaderboard_snapshots (space_id, community_id, user_id, points, rank, taken_at)
  SELECT t.space_id, t.community_id, t.user_id, t.points,
         rank() OVER (PARTITION BY t.space_id ORDER BY t.points DESC),
         taken
  FROM (
    SELECT sm.space_id, sm.community_id, sm.user_id, COALESCE(SUM(pl.delta), 0)::integer AS points
    FROM space_members sm
    LEFT JOIN points_ledger pl ON pl.space_id = sm.space_id AND pl.user_id = sm.user_id
    WHERE sm.role = 'MEMBER'
    GROUP BY sm.space_id, sm.community_id, sm.user_id
  ) t
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER leaderboard_snapshots_append_only BEFORE UPDATE ON "leaderboard_snapshots"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
