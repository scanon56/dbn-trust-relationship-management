// src/api/routes/events.routes.ts
import { Router, Request, Response } from 'express';
import { eventBus, Events } from '../../core/events/EventBus';
import { logger } from '../../utils/logger';

const router = Router();

// Server-Sent Events stream for basic messages
router.get('/basicmessages', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000); // keep connection alive

  const listener = (payload: any) => {
    try {
      const data = JSON.stringify(payload);
      res.write(`event: basicmessage\n`);
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      logger.warn('Failed to serialize SSE payload', { error: (err as Error).message });
    }
  };

  eventBus.on(Events.BASIC_MESSAGE_RECEIVED, listener);
  logger.info('SSE client subscribed for basic messages');

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off(Events.BASIC_MESSAGE_RECEIVED, listener);
    logger.info('SSE client disconnected for basic messages');
  });
});

export default router;