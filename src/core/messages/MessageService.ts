// src/core/messages/MessageService.ts
import { v4 as uuidv4 } from 'uuid';
import { DIDCommMessage } from '../../types/didcomm.types';
import { SendMessageParams, Message, MessageDirection, MessageState } from '../../types/message.types';
import { messageRepository } from './MessageRepository';
import { messageRouter } from './MessageRouter';
import { connectionRepository } from '../connections/ConnectionRepository';
import { logger } from '../../utils/logger';
import { MessageError } from '../../utils/errors';

export class MessageService {

  /**
   * Send a message to a connection
   */
  async sendMessage(params: SendMessageParams): Promise<Message> {
    logger.info('Sending message', {
      connectionId: params.connectionId,
      type: params.type,
    });

    // Get connection
    const connection = await connectionRepository.findById(params.connectionId);
    if (!connection) {
      throw new MessageError('Connection not found', 'CONNECTION_NOT_FOUND', {
        connectionId: params.connectionId,
      });
    }

    // Create DIDComm message
    const didcommMessage: DIDCommMessage = {
      id: uuidv4(),
      type: params.type,
      from: connection.myDid,
      to: [connection.theirDid],
      thid: params.threadId,
      pthid: params.parentId,
      created_time: Math.floor(Date.now() / 1000),
      body: params.body,
    };

    // Route the message
    await messageRouter.routeOutbound(didcommMessage, params.connectionId);

    // Retrieve and return the stored message
    const storedMessage = await messageRepository.findByMessageId(didcommMessage.id);
    if (!storedMessage) {
      throw new MessageError('Message not found after sending', 'MESSAGE_NOT_FOUND');
    }

    return storedMessage;
  }

  /**
   * Get message by ID
   */
  async getMessage(id: string): Promise<Message> {
    const message = await messageRepository.findById(id);
    if (!message) {
      throw new MessageError('Message not found', 'MESSAGE_NOT_FOUND', { id });
    }
    return message;
  }

  /**
   * List messages with filters
   */
  async listMessages(filters: {
    connectionId?: string;
    threadId?: string;
    type?: string;
    direction?: 'inbound' | 'outbound';
    state?: MessageState;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: Message[]; total: number }> {
    return messageRepository.list(filters);
  }

  /**
   * Get messages in a thread
   */
  async getThread(threadId: string): Promise<Message[]> {
    return messageRepository.findByThread(threadId);
  }

  /**
   * Search messages by text
   */
  async searchMessages(
    searchText: string,
    filters: {
      connectionId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ messages: Message[]; total: number }> {
    return messageRepository.search(searchText, filters);
  }

  /**
   * Retry failed message
   */
  async retryMessage(id: string): Promise<Message> {
    logger.info('Retrying failed message', { id });

    const message = await messageRepository.findById(id);
    if (!message) {
      throw new MessageError('Message not found', 'MESSAGE_NOT_FOUND', { id });
    }

    if (message.state !== 'failed') {
      throw new MessageError(
        'Only failed messages can be retried',
        'INVALID_MESSAGE_STATE',
        { id, state: message.state }
      );
    }

    if (!message.connectionId) {
      throw new MessageError(
        'Message has no associated connection',
        'NO_CONNECTION',
        { id }
      );
    }

    // Increment retry count
    await messageRepository.incrementRetry(id);

    // Reconstruct DIDComm message
    const didcommMessage: DIDCommMessage = {
      id: message.messageId,
      type: message.type,
      from: message.fromDid,
      to: message.toDids,
      thid: message.threadId,
      body: message.body,
      attachments: message.attachments,
    };

    // Reset state to pending
    await messageRepository.updateState(id, 'pending');

    // Retry routing
    try {
      await messageRouter.routeOutbound(didcommMessage, message.connectionId);
      logger.info('Message retry successful', { id });
    } catch (error) {
      logger.error('Message retry failed', { id, error });
      await messageRepository.updateState(
        id,
        'failed',
        error instanceof Error ? error.message : 'Retry failed'
      );
      throw error;
    }

    return this.getMessage(id);
  }

  /**
   * Delete message
   */
  async deleteMessage(id: string): Promise<void> {
    await messageRepository.delete(id);
  }
}

export const messageService = new MessageService();