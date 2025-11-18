// src/api/routes/messages.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { messageService } from '../../core/messages/MessageService';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  sendMessageSchema,
  listMessagesQuerySchema,
  searchMessagesQuerySchema,
} from '../schemas/message.schema';

const router = Router();

// UUID validation schema for params
const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid message ID'),
});

const threadIdParamSchema = z.object({
  threadId: z.string().min(1, 'Thread ID is required'),
});

/**
 * Send message
 * POST /api/v1/messages
 */
router.post(
  '/',
  validateBody(sendMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messageService.sendMessage(req.body);

      res.status(201).json({
        success: true,
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * List messages
 * GET /api/v1/messages
 */
router.get(
  '/',
  validateQuery(listMessagesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as any;
      
      const result = await messageService.listMessages({
        connectionId: query.connectionId,
        threadId: query.threadId,
        type: query.type,
        direction: query.direction,
        state: query.state,
        limit: query.limit,
        offset: query.offset,
      });

      res.status(200).json({
        success: true,
        data: {
          messages: result.messages,
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Search messages
 * GET /api/v1/messages/search
 */
router.get(
  '/search',
  validateQuery(searchMessagesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as any;
      
      const result = await messageService.searchMessages(query.q, {
        connectionId: query.connectionId,
        limit: query.limit,
        offset: query.offset,
      });

      res.status(200).json({
        success: true,
        data: {
          messages: result.messages,
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          query: query.q,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get message by ID
 * GET /api/v1/messages/:id
 */
router.get(
  '/:id',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messageService.getMessage(req.params.id);

      res.status(200).json({
        success: true,
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get messages in thread
 * GET /api/v1/messages/thread/:threadId
 */
router.get(
  '/thread/:threadId',
  validateParams(threadIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messages = await messageService.getThread(req.params.threadId);

      res.status(200).json({
        success: true,
        data: {
          messages,
          threadId: req.params.threadId,
          count: messages.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Retry failed message
 * POST /api/v1/messages/:id/retry
 */
router.post(
  '/:id/retry',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messageService.retryMessage(req.params.id);

      res.status(200).json({
        success: true,
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete message
 * DELETE /api/v1/messages/:id
 */
router.delete(
  '/:id',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await messageService.deleteMessage(req.params.id);

      res.status(200).json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;