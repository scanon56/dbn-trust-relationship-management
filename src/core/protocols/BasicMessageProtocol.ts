// src/core/protocols/BasicMessageProtocol.ts
import { ProtocolHandler, MessageContext } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { messageRepository } from '../messages/MessageRepository';
import { logger } from '../../utils/logger';

export class BasicMessageProtocol implements ProtocolHandler {
  readonly type = 'https://didcomm.org/basicmessage/2.0/message';
  readonly name = 'Basic Message';
  readonly version = '2.0';

  supports(messageType: string): boolean {
    return messageType === this.type || 
           messageType.startsWith('https://didcomm.org/basicmessage/2.0');
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling basic message', {
      messageId: message.id,
      from: message.from,
      connectionId: context.connectionId,
    });

    // Store the message
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      parentId: message.pthid,
      connectionId: context.connectionId,
      type: message.type,
      direction: context.direction,
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      attachments: message.attachments || [],
      state: 'processed',
      metadata: {
        transport: context.transport,
        encrypted: context.encrypted,
      },
    });

    logger.info('Basic message stored', {
      messageId: message.id,
      content: message.body.content,
    });

    // TODO: Emit event for application layer to consume
    // TODO: Support auto-reply or webhooks
  }
}