-- Prevent UPDATE on audit_trails
CREATE OR REPLACE FUNCTION prevent_audit_trail_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent UPDATE
CREATE TRIGGER audit_trails_no_update
  BEFORE UPDATE ON audit_trails
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_trail_modification();

-- Trigger to prevent DELETE
CREATE TRIGGER audit_trails_no_delete
  BEFORE DELETE ON audit_trails
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_trail_modification();
