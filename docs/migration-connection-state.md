# Connection State Migration (active/completed -> complete)

As of the Aries-aligned refactor, legacy connection states `active` and `completed` were consolidated into the canonical terminal state `complete`.

## Rationale
Aries RFC 0160 defines the lifecycle: `invited -> requested -> responded -> complete`. The previous model introduced `active` and `completed` which are now deprecated for clarity and alignment.

## Database Update
If your `connections` table contains historical rows with `active` or `completed`, execute the following SQL before deploying the new code (or as a post-deploy one-off):

```sql
-- Backup (recommended)
CREATE TABLE connections_backup AS SELECT * FROM connections;

-- Migrate legacy terminal states
UPDATE connections SET state = 'complete' WHERE state IN ('active','completed');

-- Optional: verify counts
SELECT state, COUNT(*) FROM connections GROUP BY state ORDER BY state;
```

## Application Behavior
- Read Path: The repository now maps any legacy `active` or `completed` values to `complete` when hydrating records (defensive).
- Write Path: New transitions only emit the set: `invited | requested | responded | complete | error`.
- APIs / Validation: OpenAPI spec and validation schemas now reflect the canonical set.

## Rollback Strategy
If a rollback to pre-refactor code is required:
1. Restore from `connections_backup` if needed.
2. Or leave `complete` values; older code will treat them similarly to `completed` (may require minor patch if not recognized).

## Testing After Migration
Run unit/integration tests focusing on connection lifecycle:
```bash
npm test -- ConnectionStateMachine.test.ts ConnectionProtocol.test.ts ConnectionManager.test.ts
```
Confirm no references to `active` or `completed` remain (search codebase):
```bash
grep -R "'active'" src | wc -l
grep -R "'completed'" src | wc -l
```
Both should return 0 aside from historical commit logs or this document.

## Handshake Visibility
The handshake progresses through `responded` briefly before reaching `complete`. Use the handshake logging script or connection listing endpoint with state filters to observe transitions.

## Summary
Single terminal state `complete` simplifies reasoning and matches Aries specification. Migration is a one-time SQL update plus code alignment already implemented.
