import { runMigrations } from '../../src/infrastructure/database/migrate';
import { pool } from '../../src/infrastructure/database/pool';

// We rely on patched idempotent migrations logic. Ensure migrations can run twice.

describe('Database migrations', () => {
  it('runs migrations idempotently', async () => {
    await runMigrations();
    await runMigrations(); // second run should skip or mark applied without error
    // Check schema_migrations entries exist
    const res = await pool.query('SELECT COUNT(*) AS cnt FROM schema_migrations');
    expect(parseInt(res.rows[0].cnt, 10)).toBeGreaterThanOrEqual(3);
  });
});
