// src/infrastructure/database/migrate.ts
import { pool } from './pool';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

async function runMigrations(): Promise<void> {
  // Log connection details to aid troubleshooting (no passwords)
  logger.info('Starting migrations', {
    db: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
    },
  });

  let client;
  try {
    client = await pool.connect();
  } catch (error: any) {
    // Provide clearer guidance for common connection failures
    if (error?.code === 'ECONNREFUSED') {
      logger.error('Cannot connect to PostgreSQL (ECONNREFUSED).', {
        hint:
          'Ensure PostgreSQL is running and listening on the configured host/port. On macOS (Homebrew): `brew services start postgresql` or `brew services start postgresql@16`. Then verify with `psql -h localhost -p 5432 -U postgres -d dbn_trust_management -c "SELECT 1"` or adjust your .env.',
        configuredHost: config.database.host,
        configuredPort: config.database.port,
      });
    } else if (error?.code === '28P01') {
      logger.error('Password authentication failed for PostgreSQL user.', {
        user: config.database.user,
        hint:
          'Verify the password matches the running instance. For Docker: recreate with `docker rm -f trm-db && docker run --name trm-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dbn_trust_management -p 5432:5432 -d postgres:16`. For local Homebrew: reset with `psql -U postgres -d postgres -c "ALTER ROLE postgres PASSWORD \'postgres\';"` (if you can connect via another superuser) or adjust DB_USER/DB_PASSWORD to your macOS username and blank password if trust auth is enabled.',
      });
    } else {
      logger.error('Failed to obtain a DB connection', {
        code: error?.code,
        message: error?.message,
      });
    }
    throw error;
  }
  
  try {
    // Create migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Get executed migrations
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const executedVersions = new Set(rows.map(r => r.version));
    
    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const migrations = files
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    // Execute new migrations
    for (const file of migrations) {
      const version = parseInt(file.split('_')[0]);
      
      if (executedVersions.has(version)) {
        logger.info(`Migration ${version} already executed, skipping`);
        continue;
      }
      
      logger.info(`Running migration ${version}: ${file}`);
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
      
      await client.query('BEGIN');
      try {
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [version]
          );
          await client.query('COMMIT');
          logger.info(`Migration ${version} completed successfully`);
        } catch (execError: any) {
          // Allow idempotent re-run: duplicate table/index errors
          const message = execError?.message || '';
          if (execError?.code === '42P07' || message.includes('already exists')) {
            logger.warn(`Migration ${version} encountered existing objects; treating as already applied`);
            await client.query('ROLLBACK');
            // Record as executed if not already
            await client.query(
              'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
              [version]
            );
            logger.info(`Migration ${version} marked as applied (idempotent)`);
          } else {
            throw execError;
          }
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    
    logger.info('All migrations completed');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration runner failed', { error: err });
      process.exit(1);
    });
}

export { runMigrations };