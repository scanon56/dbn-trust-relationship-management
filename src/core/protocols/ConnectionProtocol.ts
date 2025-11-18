// src/core/protocols/ConnectionProtocol.ts
import { v4 as uuidv4 } from 'uuid';
import { ProtocolHandler, MessageContext } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { connectionRepository } from '../connections/ConnectionRepository';
import { messageRepository } from '../messages/MessageRepository';
import { capabilityDiscovery } from '../discovery/CapabilityDiscovery';
import { logger } from '../../utils/logger';

export class ConnectionProtocol implements ProtocolHandler {
  readonly type = 'https://didcomm.org/connections/1.0';
  readonly name = 'Connection Protocol';
  readonly version = '1.0';

  supports(messageType: string): boolean {
    return messageType.startsWith('https://didcomm.org/connections/1.0');
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise<void> {
    const isRequest = message.type.endsWith('/request');
    const isResponse = message.type.endsWith('/response');
    const isAck = message.type.endsWith('/ack');

    if (isRequest) {
      await this.handleRequest(message, context);
    } else if (isResponse) {
      await this.handleResponse(message, context);
    } else if (isAck) {
      await this.handleAck(message, context);
    } else {
      logger.warn('Unknown connection protocol message type', { type: message.type });
    }
  }

  /**
   * Handle connection request (inviter receives this from invitee)
   */
  private async handleRequest(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling connection request', {
      messageId: message.id,
      from: message.from,
    });

    // Store the request message
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      type: message.type,
      direction: 'inbound',
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      state: 'processed',
    });

    // Find or create connection
    // In practice, we'd look up the connection by the invitation ID in the thread
    const theirDid = message.from!;
    const myDid = message.to![0];

    let connection = await connectionRepository.findByDids(myDid, theirDid);

    if (!connection) {
      // Create new connection from request
      connection = await connectionRepository.create({
        myDid,
        theirDid,
        theirLabel: typeof message.body.label === 'string' ? message.body.label : undefined,
        state: 'requested',
        role: 'inviter',
      });
    } else {
      // Update existing connection
      await connectionRepository.updateState(connection.id, 'requested');
      connection = await connectionRepository.findById(connection.id);
    }

    // Discover their capabilities
    try {
      const capabilities = await capabilityDiscovery.discoverCapabilities(theirDid);
      await connectionRepository.updateCapabilities(connection!.id, {
        theirEndpoint: capabilities.endpoint,
        theirProtocols: capabilities.protocols,
        theirServices: capabilities.services,
      });
    } catch (error) {
      logger.warn('Failed to discover capabilities during connection request', {
        theirDid,
        error,
      });
    }

    // TODO: Auto-respond with connection response
    logger.info('Connection request processed', {
      connectionId: connection!.id,
      theirDid,
    });
  }

  /**
   * Handle connection response (invitee receives this from inviter)
   */
  private async handleResponse(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling connection response', {
      messageId: message.id,
      from: message.from,
      threadId: message.thid,
    });

    // Store the response message
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      type: message.type,
      direction: 'inbound',
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      state: 'processed',
    });

    const theirDid = message.from!;
    const myDid = message.to![0];

    // Find connection
    const connection = await connectionRepository.findByDids(myDid, theirDid);

    if (!connection) {
      logger.error('Connection not found for response', { myDid, theirDid });
      return;
    }

    // Update to responded state
    await connectionRepository.updateState(connection.id, 'responded');

    // Discover their capabilities
    try {
      const capabilities = await capabilityDiscovery.discoverCapabilities(theirDid);
      await connectionRepository.updateCapabilities(connection.id, {
        theirEndpoint: capabilities.endpoint,
        theirProtocols: capabilities.protocols,
        theirServices: capabilities.services,
      });
    } catch (error) {
      logger.warn('Failed to discover capabilities during connection response', {
        theirDid,
        error,
      });
    }

    // Move to active state
    await connectionRepository.updateState(connection.id, 'active');

    logger.info('Connection established', {
      connectionId: connection.id,
      theirDid,
    });

    // TODO: Send ack if requested
  }

  /**
   * Handle connection ack (optional final step)
   */
  private async handleAck(message: DIDCommMessage, context: MessageContext): Promise<void> {
    logger.info('Handling connection ack', {
      messageId: message.id,
      from: message.from,
    });

    // Store the ack message
    await messageRepository.create({
      messageId: message.id,
      threadId: message.thid,
      type: message.type,
      direction: 'inbound',
      fromDid: message.from || 'unknown',
      toDids: message.to || [],
      body: message.body,
      state: 'processed',
    });

    const theirDid = message.from!;
    const myDid = message.to![0];

    // Find and activate connection
    const connection = await connectionRepository.findByDids(myDid, theirDid);

    if (connection && connection.state !== 'active') {
      await connectionRepository.updateState(connection.id, 'active');
      logger.info('Connection activated via ack', {
        connectionId: connection.id,
      });
    }
  }
}