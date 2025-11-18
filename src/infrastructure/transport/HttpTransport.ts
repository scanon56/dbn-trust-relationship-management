// src/infrastructure/transport/HttpTransport.ts
import { Request, Response, NextFunction } from 'express';
import { messageRouter } from '../../core/messages/MessageRouter';
import { logger } from '../../utils/logger';
import { MessageError } from '../../utils/errors';

export class HttpTransport {

  /**
   * Handle incoming DIDComm message
   */
  async handleIncomingMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const contentType = req.headers['content-type'];

      // Validate content type
      if (!contentType?.includes('application/didcomm-encrypted+json')) {
        logger.warn('Invalid content type for DIDComm message', { contentType });
        res.status(415).json({
          success: false,
          error: {
            code: 'INVALID_CONTENT_TYPE',
            message: 'Content-Type must be application/didcomm-encrypted+json',
          },
        });
        return;
      }

      // Get encrypted message from body
      const encryptedMessage = typeof req.body === 'string' 
        ? req.body 
        : JSON.stringify(req.body);

      if (!encryptedMessage) {
        res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_MESSAGE',
            message: 'Message body is empty',
          },
        });
        return;
      }

      logger.info('Received DIDComm message', {
        contentType,
        messageLength: encryptedMessage.length,
      });

      // Extract recipient DID from URL or header
      // For now, we'll need to try to decrypt with available DIDs
      // TODO: Implement proper DID resolution from message
      const recipientDid = req.query.did as string || req.headers['x-recipient-did'] as string;

      if (!recipientDid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_RECIPIENT_DID',
            message: 'Recipient DID must be provided in query param ?did= or header X-Recipient-DID',
          },
        });
        return;
      }

      // Process message asynchronously
      // Return 202 Accepted immediately
      res.status(202).json({
        success: true,
        message: 'Message accepted for processing',
      });

      // Route message in background
      setImmediate(async () => {
        try {
          await messageRouter.routeInbound(encryptedMessage, recipientDid);
          logger.info('Inbound message processed successfully');
        } catch (error) {
          logger.error('Failed to process inbound message', { error });
          // TODO: Implement dead letter queue or retry mechanism
        }
      });

    } catch (error) {
      logger.error('Error handling incoming message', { error });
      next(error);
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        service: 'didcomm-transport',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export const httpTransport = new HttpTransport();