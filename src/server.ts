// src/server.ts (complete version)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger } from './utils/logger';
import { closeDatabasePool } from './infrastructure/database/pool';
import { initializeProtocols } from './core/protocols';
import swaggerRoutes from './api/routes/swagger.routes';

// Import middleware
import { requestLogger } from './api/middleware/requestLogger';
import { errorHandler } from './api/middleware/errorHandler';

// Import routes
import healthRoutes from './api/routes/health.routes';
import didcommRoutes from './api/routes/didcomm.routes';
import connectionsRoutes from './api/routes/connections.routes';
import messagesRoutes from './api/routes/messages.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Special handling for DIDComm messages (raw body)
app.use('/didcomm', express.text({ type: 'application/didcomm-encrypted+json' }));

// Standard JSON parsing for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Initialize protocols
initializeProtocols();
logger.info('Protocol handlers initialized');

// API Routes
app.use('/health', healthRoutes);
app.use('/didcomm', didcommRoutes);
app.use('/api/v1/connections', connectionsRoutes);
app.use('/api/v1/messages', messagesRoutes);

app.use('/api-docs', swaggerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info('Server started', {
    port: config.port,
    environment: config.nodeEnv,
    didcommEndpoint: config.didcomm.endpoint,
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutdown signal received, closing server gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await closeDatabasePool();
  logger.info('Database pool closed');

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

export default app;