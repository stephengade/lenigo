ALTER TABLE "invites" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_by_id" uuid;--> statement-breakpoint
-- A community never loses its last Community Lead (OWNER) by a role change or removal.
-- Cascades (deleting the community or the user) run inside an FK trigger, so depth > 1 passes.
CREATE OR REPLACE FUNCTION lenigo_keep_one_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.role = 'OWNER' AND (TG_OP = 'DELETE' OR NEW.role <> 'OWNER') THEN
    PERFORM 1 FROM community_members
      WHERE community_id = OLD.community_id AND role = 'OWNER' AND user_id <> OLD.user_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a community must keep at least one Community Lead; make someone else Community Lead first';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_members_keep_owner BEFORE UPDATE OR DELETE ON "community_members"
  FOR EACH ROW EXECUTE FUNCTION lenigo_keep_one_owner();
