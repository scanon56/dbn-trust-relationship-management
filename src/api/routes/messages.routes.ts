// src/api/routes/messages.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { messageService } from '../../core/messages/MessageService';
import { messageProcessor } from '../../core/messages/MessageProcessor'; // NEW
import { connectionRepository } from '../../core/connections/ConnectionRepository'; // NEW
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  sendMessageSchema,
  listMessagesQuerySchema,
  searchMessagesQuerySchema,
  type ListMessagesQuery,
  type SearchMessagesQuery,
} from '../schemas/message.schema';
import { logger } from '../../utils/logger'; // NEW

const router = Router();

// UUID validation schema for params
const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid message ID'),
});

const threadIdParamSchema = z.object({
  threadId: z.string().min(1, 'Thread ID is required'),
});

// ============================================================================
// INBOUND DIDCOMM MESSAGE ENDPOINT (NEW)
// ============================================================================

/**
 * POST /api/v1/messages/inbound
 * 
 * Receive encrypted DIDComm messages from peers
 * This is the endpoint that other instances will call to deliver messages
 */
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    const { jwe } = req.body;

    if (!jwe || typeof jwe !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing or invalid jwe field',
        },
      });
    }

    logger.info('Inbound message received', {
      jweLength: jwe.length,
    });

    // Extract recipient DID from JWE header (kid field)
    const recipientDid = await findRecipientDid(jwe);

    if (!recipientDid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'RECIPIENT_NOT_FOUND',
          message: 'Could not determine recipient DID',
        },
      });
    }

    // Process the message
    const result = await messageProcessor.processInbound(jwe, recipientDid);

    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error) {
    logger.error('Error processing inbound message', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'MESSAGE_PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Failed to process message',
      },
    });
  }
});

/**
 * Helper: Find which of our DIDs is the recipient
 * 
 * Tries to determine the recipient from JWE or by trying all our DIDs
 */
async function findRecipientDid(jwe: string): Promise<string | null> {
  try {
    // Parse JWE header to extract kid
    const parts = jwe.split('.');
    if (parts.length < 2) {
      return null;
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const kid = header.kid;

    if (kid) {
      // Extract DID from kid (format: did:peer:xxx#key-1)
      const did = kid.split('#')[0];
      logger.debug('Extracted recipient DID from JWE header', { did });
      return did;
    }

    // Fallback: Get all our peer DIDs and try them
    // This is less efficient but more robust
    const connections = await connectionRepository.list({});
    const ourDids = [...new Set(connections.connections.map(c => c.myDid))];

    logger.debug('Trying DIDs to decrypt', { didCount: ourDids.length });

    for (const did of ourDids) {
      try {
        // Try to decrypt with this DID
        const { phase4Client } = await import('../../infrastructure/clients/phase4Client');
        await phase4Client.decrypt({ did, jwe });
        logger.debug('Found recipient DID', { did });
        return did;
      } catch (error) {
        // Not this DID, continue
        continue;
      }
    }

    logger.warn('Could not find recipient DID among our DIDs');
    return null;

  } catch (error) {
    logger.error('Error finding recipient DID', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

// ============================================================================
// EXISTING MESSAGE MANAGEMENT ROUTES
// ============================================================================

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
      const query = req.query as unknown as ListMessagesQuery;
      
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
      const query = req.query as unknown as SearchMessagesQuery;
      
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