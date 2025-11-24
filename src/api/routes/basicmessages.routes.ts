// src/api/routes/basicmessages.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { messageService } from '../../core/messages/MessageService';
import { buildBasicMessage } from '../../core/protocols/BasicMessageProtocol';
import { validateBody } from '../middleware/validation';
import { logger } from '../../utils/logger';

const router = Router();

// Schema: simplified basic message send
const sendBasicMessageSchema = z.object({
  connectionId: z.string().uuid('Invalid connectionId'),
  content: z.string().min(1, 'content required'),
  lang: z.string().min(1).optional(),
  threadId: z.string().optional(),
});

router.post('/', validateBody(sendBasicMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connectionId, content, lang, threadId } = req.body;
    // Build DIDComm basicmessage
    const didcommMsg = buildBasicMessage(content, lang);
    const message = await messageService.sendMessage({
      connectionId,
      type: didcommMsg.type,
      body: didcommMsg.body,
      threadId,
    });
    logger.info('Basic message sent via shortcut endpoint', { connectionId });
    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
});

export default router;