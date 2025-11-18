// tests/setup.ts
import { logger } from '../src/utils/logger';
import { closeDatabaseConnection } from './helpers/database.helper';

// Suppress logs during tests unless DEBUG_LOGS is set
if (!process.env.DEBUG_LOGS) {
	logger.transports.forEach((t) => (t.silent = true));
}

// Global test timeout
jest.setTimeout(10000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'dbn_trust_management_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.PHASE4_API_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'error';

// Ensure database pool closed after all tests to prevent open handle warnings
afterAll(async () => {
	await closeDatabaseConnection();
});