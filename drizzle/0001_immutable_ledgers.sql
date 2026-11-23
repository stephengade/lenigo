-- FR-5.1 / FR-7.1: points and audit rows are append-only.
-- UPDATE is always refused. DELETE stays possible only through ON DELETE CASCADE / SET NULL
-- (e.g. when a Super Admin deletes a whole community), never as a direct edit.
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
DROP TRIGGER IF EXISTS points_ledger_append_only ON "points_ledger";
--> statement-breakpoint
CREATE TRIGGER points_ledger_append_only BEFORE UPDATE ON "points_ledger"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_logs_append_only ON "activity_logs";
--> statement-breakpoint
CREATE TRIGGER activity_logs_append_only BEFORE UPDATE ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_update();
