-- 004_alter_connections_state.sql
-- Goal: enforce Aries-compliant states and migrate legacy rows safely.
-- Order matters: we must normalize legacy rows before adding the new constraint
-- or the ADD CONSTRAINT will fail due to existing invalid values.

-- 1. Drop existing constraint (if present) to allow legacy values temporarily
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_state_check;

-- 2. Normalize legacy rows PRIOR to new constraint
UPDATE connections SET state='complete' WHERE state IN ('active','completed');

-- 3. Add new Aries-compliant constraint
ALTER TABLE connections ADD CONSTRAINT connections_state_check CHECK (
	state IN ('invited','requested','responded','complete','error')
);

-- 4. (Optional) Verification (commented out; leave for manual execution if desired)
-- SELECT state, COUNT(*) FROM connections GROUP BY state;