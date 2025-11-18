// src/core/connections/ConnectionRepository.ts
import { pool } from '../../infrastructure/database/pool';
import { Connection, ConnectionState, OutOfBandInvitation, ServiceEndpoint } from '../../types/connection.types';
import { logger } from '../../utils/logger';
import { ConnectionError } from '../../utils/errors';

export class ConnectionRepository {
  
  /**
   * Create a new connection
   */
  async create(data: {
    myDid: string;
    theirDid: string;
    theirLabel?: string;
    state: ConnectionState;
    role: 'inviter' | 'invitee';
    theirEndpoint?: string;
    invitation?: string | OutOfBandInvitation | null;
    invitationUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Connection> {
    const query = `
      INSERT INTO connections (
        my_did, their_did, their_label, state, role,
        their_endpoint, invitation, invitation_url, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      data.myDid,
      data.theirDid,
      data.theirLabel || null,
      data.state,
      data.role,
      data.theirEndpoint || null,
      data.invitation ? JSON.stringify(data.invitation) : null,
      data.invitationUrl || null,
      JSON.stringify(data.metadata || {}),
    ];

    try {
      const result = await pool.query(query, values);
      logger.info('Connection created', { 
        connectionId: result.rows[0].id,
        myDid: data.myDid,
        theirDid: data.theirDid,
      });
      return this.mapRowToConnection(result.rows[0]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new ConnectionError(
          'Connection already exists',
          'CONNECTION_ALREADY_EXISTS',
          { myDid: data.myDid, theirDid: data.theirDid }
        );
      }
      logger.error('Failed to create connection', { error, data });
      throw error;
    }
  }

  /**
   * Find connection by ID
   */
  async findById(id: string): Promise<Connection | null> {
    const query = 'SELECT * FROM connections WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToConnection(result.rows[0]);
  }

  /**
   * Find connection by DIDs
   */
  async findByDids(myDid: string, theirDid: string): Promise<Connection | null> {
    const query = 'SELECT * FROM connections WHERE my_did = $1 AND their_did = $2';
    const result = await pool.query(query, [myDid, theirDid]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToConnection(result.rows[0]);
  }

  /**
   * List connections with optional filters
   */
  async list(filters: {
    myDid?: string;
    theirDid?: string;
    state?: ConnectionState;
    protocols?: string[];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ connections: Connection[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (filters.myDid) {
      paramCount++;
      conditions.push(`my_did = $${paramCount}`);
      values.push(filters.myDid);
    }

    if (filters.theirDid) {
      paramCount++;
      conditions.push(`their_did = $${paramCount}`);
      values.push(filters.theirDid);
    }

    if (filters.state) {
      paramCount++;
      conditions.push(`state = $${paramCount}`);
      values.push(filters.state);
    }

    if (filters.protocols && filters.protocols.length > 0) {
      paramCount++;
      conditions.push(`their_protocols ?| $${paramCount}`);
      values.push(filters.protocols);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      conditions.push(`tags && $${paramCount}`);
      values.push(filters.tags);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count total
    const countQuery = `SELECT COUNT(*) FROM connections ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const query = `
      SELECT * FROM connections
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, [...values, limit, offset]);
    
    return {
      connections: result.rows.map(row => this.mapRowToConnection(row)),
      total,
    };
  }

  /**
   * Update connection state
   */
  async updateState(id: string, state: ConnectionState): Promise<Connection> {
    const query = `
      UPDATE connections 
      SET state = $1, last_active_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [state, id]);
    
    if (result.rows.length === 0) {
      throw new ConnectionError('Connection not found', 'CONNECTION_NOT_FOUND', { id });
    }

    logger.info('Connection state updated', { 
      connectionId: id, 
      newState: state,
    });

    return this.mapRowToConnection(result.rows[0]);
  }

  /**
   * Update connection capabilities (from DID Document discovery)
   */
  async updateCapabilities(id: string, data: {
    theirEndpoint?: string;
    theirProtocols?: string[];
    theirServices?: ServiceEndpoint[];
  }): Promise<Connection> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (data.theirEndpoint !== undefined) {
      paramCount++;
      updates.push(`their_endpoint = $${paramCount}`);
      values.push(data.theirEndpoint);
    }

    if (data.theirProtocols !== undefined) {
      paramCount++;
      updates.push(`their_protocols = $${paramCount}`);
      values.push(JSON.stringify(data.theirProtocols));
    }

    if (data.theirServices !== undefined) {
      paramCount++;
      updates.push(`their_services = $${paramCount}`);
      values.push(JSON.stringify(data.theirServices));
    }

    updates.push('last_active_at = NOW()');
    
    paramCount++;
    const idParam = paramCount;
    values.push(id);

    const query = `
      UPDATE connections 
      SET ${updates.join(', ')}
      WHERE id = $${idParam}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new ConnectionError('Connection not found', 'CONNECTION_NOT_FOUND', { id });
    }

    logger.info('Connection capabilities updated', { connectionId: id });
    
    return this.mapRowToConnection(result.rows[0]);
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
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (data.theirLabel !== undefined) {
      paramCount++;
      updates.push(`their_label = $${paramCount}`);
      values.push(data.theirLabel);
    }

    if (data.tags !== undefined) {
      paramCount++;
      updates.push(`tags = $${paramCount}`);
      values.push(data.tags);
    }

    if (data.notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(data.notes);
    }

    if (data.metadata !== undefined) {
      paramCount++;
      updates.push(`metadata = $${paramCount}`);
      values.push(JSON.stringify(data.metadata));
    }

    paramCount++;
    const idParam = paramCount;
    values.push(id);

    const query = `
      UPDATE connections 
      SET ${updates.join(', ')}
      WHERE id = $${idParam}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new ConnectionError('Connection not found', 'CONNECTION_NOT_FOUND', { id });
    }

    return this.mapRowToConnection(result.rows[0]);
  }

  /**
   * Delete connection
   */
  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM connections WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new ConnectionError('Connection not found', 'CONNECTION_NOT_FOUND', { id });
    }

    logger.info('Connection deleted', { connectionId: id });
  }

  /**
   * Map database row to Connection object
   */
  private mapRowToConnection(row: {
    id: string;
    my_did: string;
    their_did: string;
    their_label?: string | null;
    state: ConnectionState;
    role: 'inviter' | 'invitee';
    their_endpoint?: string | null;
    their_protocols?: string[] | null;
    their_services?: ServiceEndpoint[] | null;
    invitation?: string | OutOfBandInvitation | null;
    invitation_url?: string | null;
    tags?: string[] | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at: Date;
    updated_at: Date;
    last_active_at?: Date | null;
  }): Connection {
    return {
      id: row.id,
      myDid: row.my_did,
      theirDid: row.their_did,
      theirLabel: row.their_label ?? undefined,
      state: row.state,
      role: row.role,
      theirEndpoint: row.their_endpoint ?? undefined,
      theirProtocols: row.their_protocols || [],
      theirServices: row.their_services || [],
      invitation: (row.invitation ?? undefined) as OutOfBandInvitation | undefined,
      invitationUrl: row.invitation_url ?? undefined,
      tags: row.tags || [],
      notes: row.notes ?? undefined,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActiveAt: row.last_active_at ?? undefined,
    };
  }
}

export const connectionRepository = new ConnectionRepository();