// src/core/protocols/TrustPingProtocol.ts
import { v4 as uuidv4 } from 'uuid';
import { ProtocolHandler, MessageContext } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { messageRepository } from '../messages/MessageRepository';
import { connectionRepository } from '../connections/ConnectionRepository';
import { logger } from '../../utils/logger';

export class TrustPingProtocol implements ProtocolHandler {
  readonly type = 'https://didcomm.org/trust-ping/2.0';
  readonly name = 'Trust Ping';
  readonly version = '2.0';

  supports(messageType: string): boolean {
    return messageType.startsWith('https://didcomm.org/trust-ping/2.0');
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise<void> {
    const isPing = message.type.endsWith('/ping');
    const isPingResponse = message.type.endsWith('/ping-response');

    if (isPing) {
      await this.handlePing(message, context);
    } else if (isPingResponse) {
      await this.handlePingResponse(message, context);
    } else {
      logger.warn('Unknown trust-ping message type', { type: message.type });
    }
  }

  private async handlePing(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling trust ping', {
      messageId: message.id,
      from: message.from,
      connectionId: context.connectionId,
    });

    // Store the ping message
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      connectionId: context.connectionId,
      type: message.type,
      direction: 'inbound',
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      state: 'processed',
    });

    // Update connection last active time
    if (context.connectionId) {
      await connectionRepository.updateState(context.connectionId, 'active');
    }

    // Check if response is requested
    const responseRequested = message.body.response_requested !== false;

    if (responseRequested) {
      logger.info('Sending trust ping response', {
        threadId: message.id,
        to: message.from,
      });

      // TODO: Send ping response
      // This will be implemented when we add the message sending capability
      const response: DIDCommMessage = {
        id: uuidv4(),
        type: 'https://didcomm.org/trust-ping/2.0/ping-response',
        from: message.to?.[0], // Our DID
        to: [message.from!],
        thid: message.id, // Thread ID links to original ping
        body: {
          comment: 'Pong',
        },
      };

      // Store outbound response
      await messageRepository.create({
        messageId: response.id,
        threadId: response.thid,
        connectionId: context.connectionId,
        type: response.type,
        direction: 'outbound',
        fromDid: response.from || 'unknown',
        toDids: response.to || [],
        body: response.body,
        state: 'pending', // Will be sent by message sender
      });

      logger.info('Trust ping response queued', {
        responseId: response.id,
        threadId: message.id,
      });
    }
  }

  private async handlePingResponse(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling trust ping response', {
      messageId: message.id,
      threadId: message.thid,
      from: message.from,
    });

    // Store the response
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      connectionId: context.connectionId,
      type: message.type,
      direction: 'inbound',
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      state: 'processed',
    });

    // Update connection as active
    if (context.connectionId) {
      await connectionRepository.updateState(context.connectionId, 'active');
    }

    // TODO: Emit event for application to know ping succeeded
    logger.info('Trust ping completed successfully', {
      threadId: message.thid,
      connectionId: context.connectionId,
    });
  }
}