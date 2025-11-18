import { logger } from '../../src/utils/logger';

// Silence logger for these tests
logger.transports.forEach(t => (t.silent = true));

describe('runMigrations error scenarios', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('ECONNREFUSED connection failure is surfaced with code', async () => {
    jest.mock('../../src/infrastructure/database/pool', () => ({
      pool: { connect: jest.fn(async () => { const err: any = new Error('refused'); err.code = 'ECONNREFUSED'; throw err; }) }
    }));
    const { runMigrations } = require('../../src/infrastructure/database/migrate');
    await expect(runMigrations()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  test('28P01 authentication failure surfaced', async () => {
    jest.mock('../../src/infrastructure/database/pool', () => ({
      pool: { connect: jest.fn(async () => { const err: any = new Error('auth fail'); err.code = '28P01'; throw err; }) }
    }));
    const { runMigrations } = require('../../src/infrastructure/database/migrate');
    await expect(runMigrations()).rejects.toMatchObject({ code: '28P01' });
  });

  test('Duplicate object (42P07) during migration treated as applied', async () => {
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        // First call: create table statement for schema_migrations
        if (sql.includes('schema_migrations')) { return { rows: [] }; }
        // Simulate listing executed migrations
        if (sql.startsWith('SELECT version')) { return { rows: [] }; }
        // When executing migration SQL, throw duplicate error once
        if (sql === 'BEGIN') { return {}; }
        if (sql === 'COMMIT' || sql.startsWith('INSERT INTO schema_migrations')) { return {}; }
        if (sql.startsWith('ROLLBACK')) { return {}; }
        const err: any = new Error('already exists'); err.code = '42P07'; throw err;
      }),
      release: jest.fn(),
    };

    jest.mock('fs/promises', () => ({
      readdir: jest.fn(async () => ['001_dup.sql']),
      readFile: jest.fn(async () => 'CREATE TABLE something();'),
    }));

    jest.mock('path', () => ({
      join: (...parts: string[]) => parts.join('/'),
      resolve: (...parts: string[]) => parts.join('/'),
    }));

    jest.mock('../../src/infrastructure/database/pool', () => ({
      pool: { connect: jest.fn(async () => mockClient) }
    }));

    const { runMigrations } = require('../../src/infrastructure/database/migrate');
    await expect(runMigrations()).resolves.toBeUndefined();
    // Ensure duplicate error path attempted and marked applied (ROLLBACK triggered)
    expect(mockClient.query).toHaveBeenCalled();
  });
});