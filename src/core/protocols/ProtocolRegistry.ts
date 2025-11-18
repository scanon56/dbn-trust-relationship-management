// src/core/protocols/ProtocolRegistry.ts
import { ProtocolHandler } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { MessageContext } from '../../types/protocol.types';
import { logger } from '../../utils/logger';
import { ProtocolError } from '../../utils/errors';

export class ProtocolRegistry {
  private handlers: Map<string, ProtocolHandler> = new Map();

  /**
   * Register a protocol handler
   */
  register(handler: ProtocolHandler): void {
    if (this.handlers.has(handler.type)) {
      logger.warn('Protocol handler already registered, overwriting', {
        type: handler.type,
      });
    }

    this.handlers.set(handler.type, handler);
    logger.info('Protocol handler registered', {
      type: handler.type,
      name: handler.name,
      version: handler.version,
    });
  }

  /**
   * Unregister a protocol handler
   */
  unregister(type: string): void {
    const removed = this.handlers.delete(type);
    if (removed) {
      logger.info('Protocol handler unregistered', { type });
    }
  }

  /**
   * Get handler for message type
   */
  getHandler(messageType: string): ProtocolHandler | null {
    // First try exact match
    if (this.handlers.has(messageType)) {
      return this.handlers.get(messageType)!;
    }

    // Try partial match (some handlers support multiple message types)
    for (const handler of this.handlers.values()) {
      if (handler.supports(messageType)) {
        return handler;
      }
    }

    return null;
  }

  /**
   * Route message to appropriate handler
   */
  async route(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.debug('Routing message', {
      type: message.type,
      id: message.id,
      direction: context.direction,
    });

    const handler = this.getHandler(message.type);

    if (!handler) {
      throw new ProtocolError(
        `No handler found for message type: ${message.type}`,
        'HANDLER_NOT_FOUND',
        { messageType: message.type }
      );
    }

    logger.info('Message routed to handler', {
      messageType: message.type,
      handlerName: handler.name,
      messageId: message.id,
    });

    try {
      await handler.handle(message, context);
      logger.info('Message handled successfully', {
        messageType: message.type,
        messageId: message.id,
      });
    } catch (error) {
      logger.error('Handler failed to process message', {
        messageType: message.type,
        messageId: message.id,
        handlerName: handler.name,
        error,
      });
      throw error;
    }
  }

  /**
   * List all registered protocols
   */
  listProtocols(): Array<{
    type: string;
    name: string;
    version: string;
  }> {
    return Array.from(this.handlers.values()).map(h => ({
      type: h.type,
      name: h.name,
      version: h.version,
    }));
  }

  /**
   * Check if protocol is supported
   */
  supports(messageType: string): boolean {
    return this.getHandler(messageType) !== null;
  }
}

export const protocolRegistry = new ProtocolRegistry();