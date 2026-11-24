-- Append-only tables: refuse direct DELETE too (0001 only refused UPDATE).
-- 0001's intent was "DELETE stays possible only through ON DELETE CASCADE / SET NULL
-- (e.g. a Super Admin deleting a whole community), never as a direct edit", but nothing
-- enforced it: a plain `DELETE FROM points_ledger` (or activity_logs, the audit trail) worked.
-- A cascade runs inside the FK's own trigger, so pg_trigger_depth() > 1 lets it through.
CREATE OR REPLACE FUNCTION lenigo_refuse_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only; rows are never deleted (write a new row instead, e.g. an ADJUSTMENT)', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER points_ledger_no_delete BEFORE DELETE ON "points_ledger"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
--> statement-breakpoint
CREATE TRIGGER activity_logs_no_delete BEFORE DELETE ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
--> statement-breakpoint
CREATE TRIGGER level_promotions_no_delete BEFORE DELETE ON "level_promotions"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
--> statement-breakpoint
CREATE TRIGGER submission_reviews_no_delete BEFORE DELETE ON "submission_reviews"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
--> statement-breakpoint
CREATE TRIGGER quiz_attempts_no_delete BEFORE DELETE ON "quiz_attempts"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
--> statement-breakpoint
CREATE TRIGGER leaderboard_snapshots_no_delete BEFORE DELETE ON "leaderboard_snapshots"
  FOR EACH ROW EXECUTE FUNCTION lenigo_refuse_delete();
