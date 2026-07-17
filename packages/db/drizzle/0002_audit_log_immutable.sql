-- BR-71: l'audit log è immutabile. Solo INSERT: qualsiasi UPDATE o DELETE
-- viene rifiutato a livello di database, per chiunque.
CREATE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_immutable: le righe di audit non si modificano né si cancellano (BR-71)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
