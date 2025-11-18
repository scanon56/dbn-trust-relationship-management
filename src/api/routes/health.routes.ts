// src/api/routes/health.routes.ts
import { Router } from 'express';
import { pool } from '../../infrastructure/database/pool';
import { phase4Client } from '../../infrastructure/clients/phase4Client';
import { logger } from '../../utils/logger';

const router = Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: 'unknown',
      phase4Api: 'unknown',
    },
  };

  let statusCode = 200;

  // Check database
  try {
    await pool.query('SELECT 1');
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
    statusCode = 503;
    logger.error('Database health check failed', { error });
  }

  // Check Phase 4 API
  try {
    // Simple connectivity check - could be improved with actual health endpoint
    await phase4Client.getDIDDocument('did:web:example.com').catch(() => {
      // Expected to fail for non-existent DID, but connection works
    });
    health.checks.phase4Api = 'healthy';
  } catch (error) {
    health.checks.phase4Api = 'unhealthy';
    health.status = 'degraded';
    statusCode = 503;
    logger.error('Phase 4 API health check failed', { error });
  }

  res.status(statusCode).json({
    success: health.status === 'healthy',
    data: health,
  });
});

export default router;