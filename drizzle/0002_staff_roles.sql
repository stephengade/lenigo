-- Staff roles the triggers recognise, and two more "staff only" rules.
--
-- 1. Community Owners and Admins act as Lead in every space of their community (the app
--    has always worked this way: lib/permissions.ts → spaceRoleFromCommunity). The triggers
--    only looked at space_members, so an Owner who never joined a space as Lead could not
--    promote, approve a second track or review a placement. lenigo_space_role now returns
--    the higher of the space role and the role inherited from the community.
--    A Super Admin override is NOT a role here: overrides never count as staff in the DB.
CREATE OR REPLACE FUNCTION lenigo_space_role(p_space uuid, p_user uuid) RETURNS space_role
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM spaces s
      JOIN community_members cm ON cm.community_id = s.community_id
      WHERE s.id = p_space AND cm.user_id = p_user AND cm.role IN ('OWNER', 'ADMIN')
    ) THEN 'LEAD'::space_role
    ELSE (SELECT role FROM space_members WHERE space_id = p_space AND user_id = p_user)
  END
$$;
--> statement-breakpoint
-- 2. Only a Mentor, Manager or Lead of the submission's space can review and score it.
CREATE OR REPLACE FUNCTION lenigo_guard_submission_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s submissions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM submissions WHERE id = NEW.submission_id;
  IF s.space_id <> NEW.space_id THEN
    RAISE EXCEPTION 'review does not match the submission''s space';
  END IF;
  IF NEW.reviewer_id IS NULL
     OR COALESCE(lenigo_space_role(NEW.space_id, NEW.reviewer_id) IN ('LEAD', 'MANAGER', 'MENTOR'), false) = false THEN
    RAISE EXCEPTION 'projects are reviewed by a Mentor or above of this space';
  END IF;
  IF NEW.decision = 'APPROVED' AND NEW.score IS NULL THEN
    RAISE EXCEPTION 'an approved project needs a score';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER submission_reviews_staff_guard BEFORE INSERT ON "submission_reviews"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_submission_review();
--> statement-breakpoint
-- 3. Attendance is marked by a Mentor, Manager or Lead of the workshop's space.
--    (0001 already refuses self-marking; this also refuses other learners.)
CREATE OR REPLACE FUNCTION lenigo_guard_attendance_marker() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.attended AND COALESCE(
       lenigo_space_role((SELECT space_id FROM workshops WHERE id = NEW.workshop_id), NEW.marked_by_id) IN ('LEAD', 'MANAGER', 'MENTOR'),
       false) = false THEN
    RAISE EXCEPTION 'attendance is marked by a Mentor or above of this space';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.attended AND NOT NEW.attended THEN
    RAISE EXCEPTION 'attendance cannot be unmarked (points were awarded); correct it with an adjustment';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workshop_rsvps_marker_guard BEFORE INSERT OR UPDATE OF attended, marked_by_id ON "workshop_rsvps"
  FOR EACH ROW EXECUTE FUNCTION lenigo_guard_attendance_marker();
