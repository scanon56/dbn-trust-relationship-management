// src/core/connections/ConnectionManager.ts
import { v4 as uuidv4 } from 'uuid';
import { connectionRepository } from './ConnectionRepository';
import { capabilityDiscovery } from '../discovery/CapabilityDiscovery';
import { ConnectionStateMachine } from './ConnectionsStateMachine';
import { 
  Connection, 
  ConnectionState,
  CreateInvitationParams,
  AcceptInvitationParams,
  OutOfBandInvitation,
} from '../../types/connection.types';
import { logger } from '../../utils/logger';
import { ConnectionError } from '../../utils/errors';
import { config } from '../../config';

export class ConnectionManager {

  /**
   * Create an out-of-band invitation
   */
  async createInvitation(params: CreateInvitationParams): Promise<{
    connection: Connection;
    invitationUrl: string;
    invitation: OutOfBandInvitation;
  }> {
    logger.info('Creating invitation', { myDid: params.myDid });

    // Create invitation object
    const invitation: OutOfBandInvitation = {
      '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
      '@id': uuidv4(),
      label: params.label,
      goal_code: params.goalCode,
      goal: params.goal,
      accept: ['didcomm/v2'],
      services: [
        {
          id: '#didcomm',
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

    // Create invitation URL
    const invitationUrl = this.encodeInvitationUrl(invitation);

    // Create pending connection record
    const connection = await connectionRepository.create({
      myDid: params.myDid,
      theirDid: '', // Unknown until they respond
      theirLabel: undefined,
      state: 'invited',
      role: 'inviter',
      invitation,
      invitationUrl,
      metadata: {
        goalCode: params.goalCode,
        goal: params.goal,
      },
    });

    logger.info('Invitation created', {
      connectionId: connection.id,
      invitationUrl,
    });

    return {
      connection,
      invitationUrl,
      invitation,
    };
  }

  /**
   * Accept an out-of-band invitation
   */
  async acceptInvitation(params: AcceptInvitationParams): Promise<Connection> {
    logger.info('Accepting invitation', { myDid: params.myDid });

    // Parse invitation
    const invitation = typeof params.invitation === 'string'
      ? this.parseInvitationUrl(params.invitation)
      : params.invitation;

    // Extract inviter's DID from services
    const inviterService = invitation.services[0];
    if (!inviterService) {
      throw new ConnectionError(
        'No service endpoint in invitation',
        'INVALID_INVITATION'
      );
    }

    // For now, we'll use a placeholder for their DID
    // In a full implementation, this would be extracted from the service or established during connection protocol
    const theirDid = typeof inviterService === 'string' 
      ? inviterService 
      : 'did:unknown:inviter'; // Placeholder

    const theirEndpoint = typeof inviterService === 'object' && 'serviceEndpoint' in inviterService
      ? (typeof inviterService.serviceEndpoint === 'string' 
          ? inviterService.serviceEndpoint 
          : undefined)
      : undefined;

    // Check if connection already exists
    const existingConnection = await connectionRepository.findByDids(params.myDid, theirDid);
    if (existingConnection) {
      throw new ConnectionError(
        'Connection already exists',
        'CONNECTION_ALREADY_EXISTS',
        { connectionId: existingConnection.id }
      );
    }

    // Create connection record
    const connection = await connectionRepository.create({
      myDid: params.myDid,
      theirDid,
      theirLabel: invitation.label || params.label,
      state: 'requested',
      role: 'invitee',
      theirEndpoint,
      invitation,
      metadata: {
        goalCode: invitation.goal_code,
        goal: invitation.goal,
      },
    });

    logger.info('Invitation accepted, connection created', {
      connectionId: connection.id,
      theirDid,
    });

    // TODO: Send connection request message to inviter
    // This will be implemented with the protocol handlers

    return connection;
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

    if (!connection.theirDid || connection.theirDid === 'did:unknown:inviter') {
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
      const capabilities = await capabilityDiscovery.discoverCapabilities(connection.theirDid);
      
      // Update connection with discovered capabilities
      const updated = await connectionRepository.updateCapabilities(id, {
        theirEndpoint: capabilities.endpoint,
        theirProtocols: capabilities.protocols,
        theirServices: capabilities.services,
      });

      logger.info('Capabilities refreshed', {
        connectionId: id,
        protocolCount: capabilities.protocols.length,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to refresh capabilities', {
        connectionId: id,
        error,
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
    await this.getConnection(id); // Ensure exists
    
    logger.info('Deleting connection', { connectionId: id });
    await connectionRepository.delete(id);
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

    // TODO: Implement actual ping using TrustPing protocol
    // This will be implemented with protocol handlers
    
    logger.info('Trust ping sent', { connectionId: id });
    
    return { success: true, responseTime: 0 };
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
}

export const connectionManager = new ConnectionManager();