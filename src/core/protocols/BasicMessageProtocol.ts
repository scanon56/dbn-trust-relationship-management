// src/core/protocols/BasicMessageProtocol.ts
import { ProtocolHandler, MessageContext } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { messageRepository } from '../messages/MessageRepository';
import { logger } from '../../utils/logger';
import { eventBus, Events } from '../events/EventBus';

export class BasicMessageProtocol implements ProtocolHandler {
  readonly type = 'https://didcomm.org/basicmessage/2.0/message';
  readonly name = 'Basic Message';
  readonly version = '2.0';

  supports(messageType: string): boolean {
    return messageType === this.type || 
           messageType.startsWith('https://didcomm.org/basicmessage/2.0');
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise<void> {
    // Validate required content per DIDComm basicmessage 2.0 spec
    const content = (message.body as any)?.content;
    if (typeof content !== 'string' || content.length === 0) {
      logger.warn('Basic message missing content; dropping', {
        messageId: message.id,
        connectionId: context.connectionId,
      });
      return; // Do not store invalid basicmessage
    }

    // Extract language (v2 'lang' header, fallback to v1 '~l10n.locale')
    const lang = (message as any).lang || (message as any)['~l10n']?.locale;

    // Determine timestamp (prefer created_time header, else derive epoch seconds)
    const createdTime = (message as any).created_time || Math.floor(Date.now() / 1000);

    // Warn if not encrypted (spec expects encrypted transmission)
    if (!context.encrypted) {
      logger.warn('Basic message received unencrypted', {
        messageId: message.id,
        connectionId: context.connectionId,
      });
    }

    logger.info('Handling basic message', {
      messageId: message.id,
      from: message.from,
      connectionId: context.connectionId,
      lang,
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
      body: { content }, // whitelist only content per spec
      attachments: message.attachments || [], // preserved (out-of-scope per spec)
      state: 'processed',
      metadata: {
        transport: context.transport,
        encrypted: context.encrypted,
        lang,
        created_time: createdTime,
        attachments_out_of_scope: (message.attachments || []).length > 0,
      },
    });

    logger.info('Basic message stored', {
      messageId: message.id,
      content: content.substring(0, 200),
      lang,
    });

    // Emit event for application layer to consume
    eventBus.emit(Events.BASIC_MESSAGE_RECEIVED, {
      messageId: message.id,
      connectionId: context.connectionId, // may be undefined for pre-association messages
      fromDid: message.from || 'unknown',
      content,
      lang,
      createdTime,
      encrypted: context.encrypted,
      attachmentsCount: (message.attachments || []).length,
    });
    // TODO: Support auto-reply or webhooks
  }
}

// Outbound helper to build a spec-compliant basicmessage 2.0 DIDComm message
export function buildBasicMessage(content: string, lang?: string): DIDCommMessage {
  const id = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? (globalThis.crypto as any).randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    type: 'https://didcomm.org/basicmessage/2.0/message',
    created_time: Math.floor(Date.now() / 1000),
    ...(lang ? { lang } : {}),
    body: { content },
  } as DIDCommMessage;
}