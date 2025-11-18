// tests/helpers/database.helper.ts
import { pool } from '../../src/infrastructure/database/pool';

export async function clearDatabase(): Promise<void> {
  await pool.query('TRUNCATE TABLE messages, connections, protocol_capabilities CASCADE');
}

export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}