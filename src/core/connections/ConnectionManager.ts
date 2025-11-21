// src/core/connections/ConnectionManager.ts
import { v4 as uuidv4 } from 'uuid';
import { connectionRepository } from './ConnectionRepository';
import { capabilityDiscovery } from '../discovery/CapabilityDiscovery';
import { ConnectionStateMachine } from './ConnectionsStateMachine';
import { didManager } from '../did/DIDManager';
import { messageRouter } from '../messages/MessageRouter';
import { 
  Connection, 
  ConnectionState,
  CreateInvitationParams,
  AcceptInvitationParams,
  OutOfBandInvitation,
} from '../../types/connection.types';
import { DIDCommMessage } from '../../types/didcomm.types';
import { logger, withCorrelation } from '../../utils/logger';
import { ConnectionError } from '../../utils/errors';
import { config } from '../../config';

export class ConnectionManager {

  /**
   * Create an out-of-band invitation
   */
  async createInvitation(params: CreateInvitationParams): Promise<{ connection: Connection; invitationUrl: string; invitation: OutOfBandInvitation; }> {
    const correlationId = uuidv4();
    const corrLogger = withCorrelation(correlationId);
    corrLogger.info('Creating invitation', { 
      myDid: params.myDid,
      targetDid: params.targetDid,
      invitationType: params.targetDid ? 'targeted' : 'open',
    });

    const tempConnectionId = uuidv4();
    const { record: peerDIDRecord } = await didManager.createPeerDIDForConnection(params.myDid, tempConnectionId);

    const invitation: OutOfBandInvitation = {
      '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
      '@id': uuidv4(),
      label: params.label,
      goal_code: params.goalCode,
      goal: params.goal,
      accept: ['didcomm/v2'],
      services: [
        {
          id: `${peerDIDRecord.did}#didcomm`,
          type: 'DIDCommMessaging',
          serviceEndpoint: config.didcomm.endpoint,
          protocols: [
            'https://didcomm.org/connections/1.0',
            'https://didcomm.org/basicmessage/2.0',
            'https://didcomm.org/trust-ping/2.0',
          ],
        },
      ],
    };
    // Embed correlation ID for downstream acceptance logging
    invitation['dbn:cid'] = correlationId;

    if (params.targetDid) {
      invitation['dbn:target'] = params.targetDid;
    }

    const invitationUrl = this.encodeInvitationUrl(invitation);

    const connection = await connectionRepository.create({
      myDid: peerDIDRecord.did,
      theirDid: params.targetDid || '',
      theirLabel: undefined,
      state: 'invited',
      role: 'inviter',
      invitation,
      invitationUrl,
      metadata: {
        baseDid: params.myDid,
        goalCode: params.goalCode,
        goal: params.goal,
        targetDid: params.targetDid,
        invitationType: params.targetDid ? 'targeted' : 'open',
        peerDIDRecord: peerDIDRecord.id,
      },
    });

    corrLogger.info('Invitation created', {
      connectionId: connection.id,
      peerDid: peerDIDRecord.did,
      invitationUrl,
      invitationType: params.targetDid ? 'targeted' : 'open',
      targetDid: params.targetDid,
    });

    return { connection, invitationUrl, invitation };
  }

  async acceptInvitation(params: AcceptInvitationParams): Promise<Connection> {
    try {
      const invitation = typeof params.invitation === 'string'
        ? this.parseInvitationUrl(params.invitation)
        : params.invitation;

      // Extract or create correlation ID and establish child logger
      const correlationId = (invitation as any)['dbn:cid'] || uuidv4();
      const corrLogger = withCorrelation(correlationId);
      corrLogger.info('Accepting invitation', { myDid: params.myDid });

      const targetDid = invitation['dbn:target'];
      if (targetDid && targetDid !== params.myDid) {
        throw new ConnectionError('This invitation is not intended for your DID','INVITATION_NOT_FOR_YOU',{ message: 'Target DID mismatch', correlationId });
      }

      if (!invitation.services || invitation.services.length === 0) {
        throw new ConnectionError('Invitation missing services','INVALID_INVITATION',{ correlationId });
      }
      const firstService = invitation.services[0];
      let inviterService: any = firstService; // ensure object form if string DID
      let theirDid: string;
      if (typeof firstService === 'string') {
        // DID reference form per OOB spec; resolve DID Document
        theirDid = firstService;
        corrLogger.info('Invitation service is DID reference; resolving DID Document', { theirDid });
      } else {
        if (!firstService.id) {
          throw new ConnectionError('Invitation service missing id','INVALID_INVITATION',{ correlationId });
        }
        theirDid = firstService.id.split('#')[0];
      }

      let theirDidDoc: any;
      try {
        theirDidDoc = await didManager.getDIDDocument(theirDid);
      } catch (e) {
        if (typeof firstService === 'string') {
          // Cannot fallback to inline service for DID reference without document
          corrLogger.error('DID resolution failed for DID reference service', { theirDid, error: e instanceof Error ? e.message : e });
          throw new ConnectionError('Failed to resolve DID Document for invitation DID service','DID_RESOLUTION_FAILED',{ theirDid, correlationId });
        }
        corrLogger.warn('DID resolution failed; using inline service block', { theirDid, error: e instanceof Error ? e.message : e });
        theirDidDoc = { '@context': 'https://www.w3.org/ns/did/v1', id: theirDid, service: [inviterService] };
      }

      if (!theirDidDoc || typeof theirDidDoc !== 'object') {
        corrLogger.error('Resolved DID Document is invalid or undefined', { theirDid, correlationId });
        throw new ConnectionError('Invalid DID Document after resolution','DID_RESOLUTION_FAILED',{ theirDid, correlationId });
      }

      const normalizeEndpoint = (ep: any): string | undefined => {
        if (!ep) return undefined;
        if (typeof ep === 'string') return ep;
        if (typeof ep === 'object') {
          if (typeof ep.uri === 'string') return ep.uri;
          if (typeof ep.url === 'string') return ep.url;
          if (typeof ep.endpoint === 'string') return ep.endpoint;
        }
        return undefined;
      };

      let theirEndpoint = typeof inviterService === 'object' ? normalizeEndpoint(inviterService.serviceEndpoint) : undefined;
      const resolvedEndpoint = didManager.extractServiceEndpoint(theirDidDoc);
      if (resolvedEndpoint) theirEndpoint = resolvedEndpoint;

      if (!Array.isArray(theirDidDoc.service)) {
        corrLogger.warn('DID Document service array missing', { theirDid, correlationId });
        theirDidDoc.service = []; // normalize to empty array to avoid undefined access downstream
      }

      const theirProtocols = didManager.extractProtocols(theirDidDoc);
      const theirServices = didManager.extractServices(theirDidDoc);

      const existingConnection = await connectionRepository.findByDids(params.myDid, theirDid);
      if (existingConnection) {
        throw new ConnectionError('Connection already exists','CONNECTION_ALREADY_EXISTS',{ connectionId: existingConnection.id, correlationId });
      }

      const tempConnectionId = uuidv4();
      const { record: ourPeerDIDRecord, didDocument: ourPeerDIDDoc } = await didManager.createPeerDIDForConnection(params.myDid, tempConnectionId);

      const connection = await connectionRepository.create({
        myDid: ourPeerDIDRecord.did,
        theirDid,
        theirLabel: invitation.label || params.label,
        state: 'requested',
        role: 'invitee',
        theirEndpoint,
        theirProtocols,
        theirServices,
        invitation,
        metadata: {
          baseDid: params.myDid,
          goalCode: invitation.goal_code,
          goal: invitation.goal,
          invitationId: invitation['@id'],
          wasTargeted: !!targetDid,
          peerDIDRecord: ourPeerDIDRecord.id,
          correlationId,
        },
      });

      corrLogger.info('Invitation accepted', { connectionId: connection.id, ourPeerDid: ourPeerDIDRecord.did, theirDid });

      if (theirEndpoint) {
        try {
          await this.sendConnectionRequest(connection, ourPeerDIDDoc, invitation);
        } catch (e) {
          corrLogger.warn('Connection request failed; continuing without outbound request', { connectionId: connection.id });
        }
      } else {
        corrLogger.info('Skipping connection request; no endpoint', { connectionId: connection.id });
      }

      // Defensive: ensure connection did not incorrectly transition to error due to legacy logic
      const postSend = await connectionRepository.findById(connection.id);
      if (postSend && postSend.state === 'error') {
        corrLogger.warn('Reverting erroneous error state after acceptance', { connectionId: connection.id });
        await connectionRepository.updateState(connection.id, 'requested');
        await connectionRepository.updateMetadata(connection.id, {
          metadata: { ...(postSend.metadata || {}), repairedFromErrorState: true }
        });
        const repaired = await connectionRepository.findById(connection.id);
        return repaired!;
      }

      return connection;
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      logger.error('Unhandled acceptInvitation error', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new ConnectionError('Failed to accept invitation','INVITATION_ACCEPT_FAILED',{ rawError: error instanceof Error ? error.message : error });
    }
  }

  /**
   * Send connection request message
   * 
   * @param connection - The connection record
   * @param ourDIDDoc - Our DID Document to share
   * @param invitation - The original invitation
   */
  private async sendConnectionRequest(
    connection: Connection,
    ourDIDDoc: any,
    invitation: OutOfBandInvitation
  ): Promise<void> {
    const correlationId = (connection.metadata?.correlationId as string) || (invitation as any)['dbn:cid'];
    const corrLogger = correlationId ? withCorrelation(correlationId) : logger;
    corrLogger.info('Sending connection request', {
      connectionId: connection.id,
      to: connection.theirDid,
    });

    const requestMessage: DIDCommMessage = {
      type: 'https://didcomm.org/connections/1.0/request',
      id: uuidv4(),
      from: connection.myDid,
      to: [connection.theirDid],
      created_time: Date.now(),
      body: {
        label: connection.metadata?.baseDid || connection.myDid,
        connection: {
          did: connection.myDid,
          did_doc: ourDIDDoc,
        },
        invitation_id: invitation['@id'],
      },
    };

    try {
      await messageRouter.routeOutbound(requestMessage, connection.id);
      corrLogger.info('Connection request sent', { connectionId: connection.id });
    } catch (error) {
      corrLogger.warn('Connection request failed; retaining requested state', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Optionally annotate metadata to indicate outbound failure (non-fatal)
      try {
        await connectionRepository.updateMetadata(connection.id, {
          metadata: { outboundRequestFailed: true }
        } as any);
      } catch (e) {
        corrLogger.debug('Failed to annotate outboundRequestFailed metadata', { connectionId: connection.id });
      }
    }
  }

  /**
   * Get connection by ID
   */
  async getConnection(id: string): Promise<Connection> {
    const connection = await connectionRepository.findById(id);
    
    if (!connection) {
      throw new ConnectionError('Connection not found', 'CONNECTION_NOT_FOUND', { id });
    }

    return connection;
  }

  /**
   * List connections with filters
   */
  async listConnections(filters: {
    myDid?: string;
    state?: ConnectionState;
    protocols?: string[];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ connections: Connection[]; total: number }> {
    return connectionRepository.list(filters);
  }

  /**
   * Update connection state
   */
  async updateConnectionState(id: string, newState: ConnectionState): Promise<Connection> {
    const connection = await this.getConnection(id);
    
    // Validate state transition
    ConnectionStateMachine.validateTransition(connection.state, newState);
    
    // Update state
    const updated = await connectionRepository.updateState(id, newState);
    
    logger.info('Connection state updated', {
      connectionId: id,
      oldState: connection.state,
      newState,
    });

    return updated;
  }

  /**
   * Discover and update peer capabilities
   */
  async refreshCapabilities(id: string): Promise<Connection> {
    const connection = await this.getConnection(id);

    if (!connection.theirDid) {
      throw new ConnectionError(
        'Cannot discover capabilities: peer DID unknown',
        'UNKNOWN_PEER_DID',
        { connectionId: id }
      );
    }

    logger.info('Refreshing capabilities', {
      connectionId: id,
      theirDid: connection.theirDid,
    });

    try {
      // Get fresh DID Document
      const theirDidDoc = await didManager.getDIDDocument(connection.theirDid);
      
      // Extract capabilities
      const theirEndpoint = didManager.extractServiceEndpoint(theirDidDoc);
      const theirProtocols = didManager.extractProtocols(theirDidDoc);
      const theirServices = didManager.extractServices(theirDidDoc);
      
      // Update connection with discovered capabilities
      const updated = await connectionRepository.updateCapabilities(id, {
        theirEndpoint: theirEndpoint || '',
        theirProtocols,
        theirServices,
      });

      logger.info('Capabilities refreshed', {
        connectionId: id,
        protocolCount: theirProtocols.length,
        endpoint: theirEndpoint,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to refresh capabilities', {
        connectionId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update connection metadata
   */
  async updateMetadata(id: string, data: {
    theirLabel?: string;
    tags?: string[];
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Connection> {
    await this.getConnection(id); // Ensure exists
    return connectionRepository.updateMetadata(id, data);
  }

  /**
   * Delete connection
   */
  async deleteConnection(id: string): Promise<void> {
    const connection = await this.getConnection(id);
    
    logger.info('Deleting connection', { connectionId: id });

    // Deactivate peer DID
    if (connection.myDid && connection.myDid.startsWith('did:peer:')) {
      await didManager.deactivatePeerDID(connection.myDid);
    }

    await connectionRepository.delete(id);
    
    logger.info('Connection deleted', { connectionId: id });
  }

  /**
   * Send trust ping to check connection health
   */
  async ping(id: string): Promise<{ success: boolean; responseTime?: number }> {
    const connection = await this.getConnection(id);

    if (connection.state !== 'active') {
      throw new ConnectionError(
        'Can only ping active connections',
        'INVALID_CONNECTION_STATE',
        { state: connection.state }
      );
    }

    logger.info('Sending trust ping', { connectionId: id });

    const pingMessage: DIDCommMessage = {
      type: 'https://didcomm.org/trust-ping/2.0/ping',
      id: uuidv4(),
      from: connection.myDid,
      to: [connection.theirDid],
      created_time: Date.now(),
      body: {
        response_requested: true,
      },
    };

    const startTime = Date.now();

    try {
      await messageRouter.routeOutbound(pingMessage, connection.id);
      
      // In a real implementation, we'd wait for the ping response
      // For now, we'll just return success
      const responseTime = Date.now() - startTime;
      
      logger.info('Trust ping sent', { 
        connectionId: id,
        responseTime,
      });
      
      return { success: true, responseTime };
    } catch (error) {
      logger.error('Trust ping failed', {
        connectionId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false };
    }
  }

  /**
   * Encode invitation as URL
   */
  private encodeInvitationUrl(invitation: OutOfBandInvitation): string {
    const encoded = Buffer.from(JSON.stringify(invitation)).toString('base64url');
    return `https://didcomm.org/oob?_oob=${encoded}`;
  }

  /**
   * Parse invitation from URL
   */
  private parseInvitationUrl(url: string): OutOfBandInvitation {
    try {
      // Extract OOB parameter
      const urlObj = new URL(url);
      const oobParam = urlObj.searchParams.get('_oob');
      
      if (!oobParam) {
        throw new Error('Missing _oob parameter');
      }

      // Decode and parse
      const decoded = Buffer.from(oobParam, 'base64url').toString('utf-8');
      const invitation = JSON.parse(decoded);

      // Basic validation
      if (invitation['@type'] !== 'https://didcomm.org/out-of-band/2.0/invitation') {
        throw new Error('Invalid invitation type');
      }

      return invitation;
    } catch (error) {
      logger.error('Failed to parse invitation URL', { url, error });
      throw new ConnectionError(
        'Invalid invitation URL',
        'INVALID_INVITATION',
        { url, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Helper: Activate a connection by progressing through remaining states.
   * This is a temporary shortcut until full protocol handshake is implemented.
   */
  async activateConnection(id: string): Promise<Connection> {
    const connection = await this.getConnection(id);

    if (connection.state === 'active') {
      logger.info('Connection already active', { connectionId: id });
      return connection;
    }

    const orderedStates: ConnectionState[] = ['invited', 'requested', 'responded', 'active'];
    let currentIndex = orderedStates.indexOf(connection.state);

    if (currentIndex === -1) {
      throw new ConnectionError(
        'Cannot activate from current state',
        'INVALID_CONNECTION_STATE',
        { state: connection.state }
      );
    }

    let updated = connection;
    while (updated.state !== 'active') {
      const nextState = orderedStates[currentIndex + 1];
      if (!nextState) {
        throw new ConnectionError(
          'Activation sequence incomplete',
          'ACTIVATION_FAILED',
          { finalState: updated.state }
        );
      }
      ConnectionStateMachine.validateTransition(updated.state, nextState);
      updated = await connectionRepository.updateState(id, nextState);
      currentIndex++;
      logger.info('Connection activation progressed', {
        connectionId: id,
        newState: updated.state,
      });
    }

    logger.info('Connection activated via helper', { connectionId: id });
    return updated;
  }
}

export const connectionManager = new ConnectionManager();