// src/core/messages/MessageRouter.ts
import { v4 as uuidv4 } from 'uuid';
import { DIDCommMessage } from '../../types/didcomm.types';
import { MessageContext } from '../../types/protocol.types';
import { messageRepository } from './MessageRepository';
import { connectionRepository } from '../connections/ConnectionRepository';
import { protocolRegistry } from '../protocols/ProtocolRegistry';
import { phase4Client } from '../../infrastructure/clients/phase4Client';
import { logger } from '../../utils/logger';
import { MessageError } from '../../utils/errors';

export class MessageRouter {

  /**
   * Route an incoming encrypted DIDComm message
   */
  async routeInbound(encryptedMessage: string, recipientDid: string): Promise<void> {
    logger.info('Routing inbound message', { recipientDid });

    try {
      // Decrypt message using Phase 4 API
      const decrypted = await phase4Client.decrypt({
        did: recipientDid,
        jwe: encryptedMessage,
      });

      // Parse decrypted message
      const message: DIDCommMessage = JSON.parse(decrypted.plaintext);

      logger.info('Message decrypted', {
        messageId: message.id,
        type: message.type,
        from: message.from,
      });

      // Find connection (if exists)
      let connectionId: string | undefined;
      if (message.from) {
        const connection = await connectionRepository.findByDids(
          recipientDid,
          message.from
        );
        connectionId = connection?.id;
      }

      // Create message context
      const context: MessageContext = {
        connectionId,
        direction: 'inbound',
        transport: 'http',
        encrypted: true,
      };

      // Route to protocol handler
      await protocolRegistry.route(message, context);

      logger.info('Inbound message routed successfully', {
        messageId: message.id,
        type: message.type,
      });
    } catch (error) {
      logger.error('Failed to route inbound message', {
        recipientDid,
        error,
      });
      throw new MessageError(
        'Failed to route inbound message',
        'ROUTING_FAILED',
        { recipientDid, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Route an outbound message to a peer
   */
  async routeOutbound(
    message: DIDCommMessage,
    connectionId: string
  ): Promise<void> {
    logger.info('Routing outbound message', {
      messageId: message.id,
      type: message.type,
      connectionId,
    });

    try {
      // Get connection details
      const connection = await connectionRepository.findById(connectionId);
      if (!connection) {
        throw new MessageError('Connection not found', 'CONNECTION_NOT_FOUND', {
          connectionId,
        });
      }

      if (connection.state !== 'active') {
        throw new MessageError(
          'Connection is not active',
          'CONNECTION_NOT_ACTIVE',
          { connectionId, state: connection.state }
        );
      }

      if (!connection.theirEndpoint) {
        throw new MessageError(
          'No endpoint configured for connection',
          'NO_ENDPOINT',
          { connectionId }
        );
      }

      // Store message in pending state (reuse existing row if this is a retry)
      let storedMessage = await messageRepository.findByMessageId(message.id);
      if (!storedMessage) {
        storedMessage = await messageRepository.create({
          messageId: message.id,
          threadId: message.thid,
          connectionId,
          type: message.type,
          direction: 'outbound',
          fromDid: message.from || connection.myDid,
          toDids: message.to || [connection.theirDid],
          body: message.body,
          attachments: message.attachments || [],
          state: 'pending',
        });
      }

      // Encrypt message
      const encrypted = await phase4Client.encrypt({
        to: connection.theirDid,
        plaintext: JSON.stringify(message),
        from: connection.myDid,
      });

      // Send to peer endpoint
      await this.sendToEndpoint(connection.theirEndpoint, encrypted.jwe);

      // Update message state
      await messageRepository.updateState(storedMessage.id, 'sent');

      logger.info('Outbound message sent successfully', {
        messageId: message.id,
        endpoint: connection.theirEndpoint,
      });
    } catch (error) {
      logger.error('Failed to route outbound message', {
        messageId: message.id,
        connectionId,
        error,
      });

      // Update message state to failed
      try {
        const failedMessage = await messageRepository.findByMessageId(message.id);
        if (failedMessage) {
          await messageRepository.updateState(
            failedMessage.id,
            'failed',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      } catch (updateError) {
        logger.error('Failed to update message state', { updateError });
      }

      throw error;
    }
  }

  /**
   * Send encrypted message to peer endpoint
   */
  private async sendToEndpoint(endpoint: string, encryptedMessage: string): Promise<void> {
    logger.debug('Sending to endpoint', { endpoint });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/didcomm-encrypted+json',
        },
        body: encryptedMessage,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        );
      }

      logger.debug('Message delivered to endpoint', {
        endpoint,
        status: response.status,
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new MessageError(
          'Message delivery timeout',
          'DELIVERY_TIMEOUT',
          { endpoint }
        );
      }

      throw new MessageError(
        'Failed to deliver message',
        'DELIVERY_FAILED',
        {
          endpoint,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
  }
}

export const messageRouter = new MessageRouter();