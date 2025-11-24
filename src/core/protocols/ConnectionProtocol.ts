// src/core/protocols/ConnectionProtocol.ts
import { v4 as uuidv4 } from 'uuid';
import { ProtocolHandler, MessageContext } from '../../types/protocol.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { connectionRepository } from '../connections/ConnectionRepository';
import { messageRouter } from '../messages/MessageRouter';
import { didManager } from '../did/DIDManager';
import { messageRepository } from '../messages/MessageRepository';
import { capabilityDiscovery } from '../discovery/CapabilityDiscovery';
import { logger } from '../../utils/logger';
import { config } from '../../config';

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

    // If not found, attempt invitation correlation fallback
    if (!connection) {
      const invitationId = (message.body as any)?.invitation_id;
      if (invitationId) {
        const byInvitation = await connectionRepository.findByMyDidAndInvitationId(myDid, invitationId);
        if (byInvitation) {
          logger.info('Matched existing invitation via invitation_id', { connectionId: byInvitation.id, invitationId });
          // Update peer info and advance state
          await connectionRepository.updatePeerInfo(byInvitation.id, {
            theirDid,
            theirLabel: typeof message.body.label === 'string' ? message.body.label : undefined,
          });
          await connectionRepository.updateState(byInvitation.id, 'requested');
          connection = await connectionRepository.findById(byInvitation.id);
        }
      }
    }

    // Still not found: create new connection record
    if (!connection) {
      connection = await connectionRepository.create({
        myDid,
        theirDid,
        theirLabel: typeof message.body.label === 'string' ? message.body.label : undefined,
        state: 'requested',
        role: 'inviter',
      });
    }

    // Discover their capabilities
    // 1. Fast path: extract from DID Document carried in the request body
    const bodyAny = message.body as any;
    // Log body structure to diagnose missing DID Document
    logger.debug('Connection request body', { body: bodyAny });
    let requestDidDoc = bodyAny?.connection?.did_doc
      || bodyAny?.connection?.didDoc
      || bodyAny?.did_doc
      || bodyAny?.didDoc;

    // If not inline, try attachments for a JSON DID Doc
    if (!requestDidDoc && Array.isArray(message.attachments)) {
      for (const att of message.attachments as any[]) {
        const data = att?.data;
        const json = data?.json || (typeof data?.base64 === 'string' ? (() => { try { return JSON.parse(Buffer.from(data.base64, 'base64').toString('utf-8')); } catch { return undefined; } })() : undefined);
        if (json && typeof json === 'object' && (json.service || json.verificationMethod)) {
          requestDidDoc = json;
          break;
        }
      }
    }
    if (requestDidDoc && typeof requestDidDoc === 'object') {
      try {
        // Debug: dump raw DID Document carried in connection request for endpoint inference troubleshooting
        logger.debug('Request DID Document raw', { didDoc: requestDidDoc });
        const endpointFast = didManager.extractServiceEndpoint(requestDidDoc);
        const protocolsFast = didManager.extractProtocols(requestDidDoc);
        const servicesFast = didManager.extractServices(requestDidDoc);
        await connectionRepository.updateCapabilities(connection!.id, {
          theirEndpoint: endpointFast || '',
          theirProtocols: protocolsFast,
          theirServices: servicesFast,
        });
        logger.info('Applied capabilities from request DID Document (fast path)', {
          connectionId: connection!.id,
          endpoint: endpointFast,
          protocolCount: protocolsFast.length,
        });
      } catch (e) {
        logger.warn('Failed to apply capabilities from request DID Document', { error: e instanceof Error ? e.message : e });
      }

      // Heuristic fallback: attempt to infer endpoint if still missing
      const refreshed = await connectionRepository.findById(connection!.id);
      if (!refreshed?.theirEndpoint) {
        let inferred: string | undefined;
        try {
          const svc = Array.isArray(requestDidDoc.service) ? requestDidDoc.service : [];
          for (const s of svc) {
            if (!s) continue;
            const ep = typeof s.serviceEndpoint === 'string'
              ? s.serviceEndpoint
              : (typeof s.serviceEndpoint === 'object' && (s.serviceEndpoint.uri || s.serviceEndpoint.url || s.serviceEndpoint.endpoint)) || undefined;
            if (ep) { inferred = ep; break; }
          }
          if (!inferred) {
            const direct = (requestDidDoc as any).serviceEndpoint || (requestDidDoc as any).endpoint || (requestDidDoc as any).uri;
            if (typeof direct === 'string') inferred = direct;
          }
          // Deep scan (recursive) for any serviceEndpoint-like string
          if (!inferred) {
            const visited = new Set<any>();
            const search = (obj: any) => {
              if (!obj || typeof obj !== 'object' || visited.has(obj) || inferred) return;
              visited.add(obj);
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string') {
                  if (['serviceEndpoint','endpoint','uri','url'].includes(key) && /^https?:\/\//.test(val)) {
                    inferred = val; return;
                  }
                } else if (typeof val === 'object') {
                  search(val);
                }
              }
            };
            search(requestDidDoc);
          }
        } catch (err) {
          logger.debug('Endpoint inference heuristic failed', { error: err instanceof Error ? err.message : err });
        }
        if (inferred) {
          await connectionRepository.updateCapabilities(connection!.id, {
            theirEndpoint: inferred,
          });
          logger.info('Inferred endpoint from request DID Document heuristic', { connectionId: connection!.id, endpoint: inferred });
        }
          logger.info('No endpoint inferred from request DID Document', { connectionId: connection!.id });
      }
    }

    // 2. Discovery path (may refine or override if more authoritative)
    try {
      const capabilities = await capabilityDiscovery.discoverCapabilities(theirDid);
      if (capabilities.endpoint || capabilities.protocols.length || capabilities.services.length) {
        await connectionRepository.updateCapabilities(connection!.id, {
          theirEndpoint: capabilities.endpoint || '',
          theirProtocols: capabilities.protocols,
          theirServices: capabilities.services,
        });
        logger.info('Refined capabilities via discovery', {
          connectionId: connection!.id,
          endpoint: capabilities.endpoint,
          protocolCount: capabilities.protocols.length,
        });
      }
    } catch (error) {
      logger.warn('Capability discovery failed; using fast path values if present', {
        theirDid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Attempt auto-response if we have discovered their endpoint
    const updated = await connectionRepository.findById(connection!.id);
    if (updated?.theirEndpoint) {
      try {
        const myDidDoc = await didManager.getDIDDocument(myDid);
        const responseMessage: DIDCommMessage = {
          type: 'https://didcomm.org/connections/1.0/response',
          id: uuidv4(),
          thid: message.id,
          from: myDid,
          to: [theirDid],
          created_time: Date.now(),
          body: {
            did: myDid,
            did_doc: myDidDoc,
            label: updated.theirLabel,
          },
        };

        await messageRouter.routeOutbound(responseMessage, updated.id);
        logger.info('Auto connection response sent', { connectionId: updated.id, to: theirDid });
        // Progress inviter side to responded state
        const beforeState = updated.state;
        await connectionRepository.updateState(updated.id, 'responded', 'Received connection request, sent response');
        logger.info('Connection state progressed (inviter side) to responded', { connectionId: updated.id, previousState: beforeState });

        // Optional auto-activation (skips waiting for ack) if flag enabled
        // Standard protocol: remain in responded until inviter receives an ack or another confirming message.
      } catch (error) {
        logger.warn('Failed to auto-send connection response', { error });
      }
    }

    logger.info('Connection request processed', { connectionId: connection!.id, theirDid });
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
    await connectionRepository.updateState(connection.id, 'responded', 'Received connection response');

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

    // Do not move to complete yet; await sending ack or other confirming message.

    logger.info('Connection established', {
      connectionId: connection.id,
      theirDid,
    });

    // Auto-send ack to finalize inviter's side if endpoint known
    if (connection.theirEndpoint) {
      try {
        const ackMessage: DIDCommMessage = {
          type: 'https://didcomm.org/connections/1.0/ack',
          id: uuidv4(),
          thid: message.id,
          from: myDid,
          to: [theirDid],
          created_time: Date.now(),
          body: { status: 'OK' },
        };
        await messageRouter.routeOutbound(ackMessage, connection.id);
        logger.info('Auto connection ack sent', { connectionId: connection.id, to: theirDid });
        // Mark local (invitee side) connection complete after sending ack
        const refreshed = await connectionRepository.findById(connection.id);
        if (refreshed && refreshed.state === 'responded') {
          await connectionRepository.updateState(connection.id, 'complete', 'Sent connection ack (finalization)');
          logger.info('Connection completed (invitee side) after sending ack', {
            connectionId: connection.id,
            previousState: 'responded',
            newState: 'complete',
          });
        }
      } catch (error) {
        logger.warn('Failed to auto-send connection ack', { error });
      }
    }

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

    if (connection) {
      const prev = connection.state;
      if (connection.state !== 'complete') {
        await connectionRepository.updateState(connection.id, 'complete', 'Received connection ack (confirmation)');
        logger.info('Connection completed via ack', {
          connectionId: connection.id,
          previousState: prev,
          newState: 'complete',
        });
      } else {
        logger.debug('Ack received but connection already complete', { connectionId: connection.id });
      }
    }
  }
}
// Export singleton instance for use throughout the application
export const connectionProtocol = new ConnectionProtocol();