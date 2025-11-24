// src/core/messages/MessageProcessor.ts
import { phase4Client } from '../../infrastructure/clients/phase4Client';
import { DIDCommMessage } from '../../types/didcomm.types';
import { connectionRepository } from '../connections/ConnectionRepository';
import { protocolRegistry } from '../protocols/ProtocolRegistry'; // CHANGED
import { logger } from '../../utils/logger';
import { MessageError } from '../../utils/errors';

/**
 * Message Processor
 * 
 * Processes inbound DIDComm messages:
 * - Decrypts JWE using recipient DID
 * - Parses DIDComm message
 * - Routes to appropriate protocol handler via ProtocolRegistry
 */
export class MessageProcessor {
  
  /**
   * Process inbound encrypted message
   * 
   * @param jwe - Encrypted JWE string
   * @param recipientDid - Our DID that should be able to decrypt
   * @returns Processing result
   */
  async processInbound(jwe: string, recipientDid: string): Promise<{
    success: boolean;
    messageId?: string;
    messageType?: string;
  }> {
    logger.info('Processing inbound message', { recipientDid });

    try {
      // Decrypt with Phase 4
      logger.debug('Decrypting message', { recipientDid });

      const decryptResult = await phase4Client.decrypt({
        did: recipientDid,
        jwe,
      });

      logger.debug('Message decrypted', {
        recipientDid,
        kid: decryptResult.kid,
      });

      // Parse DIDComm message
      const message = JSON.parse(decryptResult.plaintext) as DIDCommMessage;

      logger.info('Inbound message parsed', {
        messageType: message.type,
        messageId: message.id,
        from: message.from,
        to: message.to,
      });

      // Validate message structure
      this.validateMessage(message);

      // Find or infer connection
      const connection = await this.findConnectionForMessage(message);

      // Route to protocol handler via ProtocolRegistry
      await protocolRegistry.route(message, {
        connectionId: connection?.id,
        receivedAt: new Date(),
        direction: 'inbound',
        transport: 'http',
        encrypted: true,    
      });

      return {
        success: true,
        messageId: message.id,
        messageType: message.type,
      };

    } catch (error) {
      logger.error('Failed to process inbound message', {
        recipientDid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw new MessageError(
        'Failed to process inbound message',
        'MESSAGE_PROCESSING_FAILED',
        { recipientDid, error }
      );
    }
  }

  /**
   * Validate DIDComm message structure
   */
  private validateMessage(message: any): asserts message is DIDCommMessage {
    if (!message.type) {
      throw new MessageError('Missing message type', 'INVALID_MESSAGE');
    }
    if (!message.id) {
      throw new MessageError('Missing message id', 'INVALID_MESSAGE');
    }
    if (!message.body) {
      throw new MessageError('Missing message body', 'INVALID_MESSAGE');
    }
  }

  /**
   * Find connection for incoming message
   * 
   * Matches by sender DID (message.from)
   */
  private async findConnectionForMessage(message: DIDCommMessage): Promise<any> {
    if (!message.from) {
      logger.warn('Message has no sender DID', { messageId: message.id });
      return null;
    }

    // Try to find connection by their DID
    const connection = await connectionRepository.findByTheirDid(message.from);

    if (!connection) {
      logger.warn('No connection found for message sender', {
        from: message.from,
        messageId: message.id,
      });
      return null;
    }

    logger.debug('Connection found for message', {
      connectionId: connection.id,
      from: message.from,
    });

    return connection;
  }
}

export const messageProcessor = new MessageProcessor();