// src/infrastructure/database/pool.ts
import { Pool, PoolConfig } from 'pg';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const poolConfig: PoolConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: config.database.maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

export async function closeDatabasePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}