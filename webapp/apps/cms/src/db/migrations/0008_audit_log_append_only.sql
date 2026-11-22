-- The audit log is append-only (PRD R13): no code path, bug or query can
-- change or remove an entry; only a deliberate DROP TRIGGER could. Restores
-- load a dump into a new database, which these triggers do not touch.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_change" BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
