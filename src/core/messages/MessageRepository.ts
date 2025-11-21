// src/core/messages/MessageRepository.ts
import { pool } from '../../infrastructure/database/pool';
import { Message, MessageState, MessageDirection } from '../../types/message.types';
import { logger } from '../../utils/logger';
import { MessageError } from '../../utils/errors';

export class MessageRepository {

  /**
   * Create a new message
   */
  async create(data: {
    messageId: string;
    threadId?: string;
    parentId?: string;
    connectionId?: string;
    type: string;
    direction: MessageDirection;
    fromDid: string;
    toDids: string[];
    body: Record<string, unknown>;
    attachments?: unknown[];
    state: MessageState;
    metadata?: Record<string, unknown>;
  }): Promise<Message> {
    const query = `
      INSERT INTO messages (
        message_id, thread_id, parent_id, connection_id,
        type, direction, from_did, to_dids, body, attachments,
        state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      data.messageId,
      data.threadId || null,
      data.parentId || null,
      data.connectionId || null,
      data.type,
      data.direction,
      data.fromDid,
      data.toDids,
      JSON.stringify(data.body),
      JSON.stringify(data.attachments || []),
      data.state,
      JSON.stringify(data.metadata || {}),
    ];

    try {
      const result = await pool.query(query, values);
      logger.info('Message created', {
        id: result.rows[0].id,
        messageId: data.messageId,
        type: data.type,
        direction: data.direction,
      });
      return this.mapRowToMessage(result.rows[0]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new MessageError(
          'Message already exists',
          'MESSAGE_ALREADY_EXISTS',
          { messageId: data.messageId }
        );
      }
      logger.error('Failed to create message', { error, data });
      throw error;
    }
  }

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<Message | null> {
    const query = 'SELECT * FROM messages WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMessage(result.rows[0]);
  }

  /**
   * Find message by message ID
   */
  async findByMessageId(messageId: string): Promise<Message | null> {
    const query = 'SELECT * FROM messages WHERE message_id = $1';
    const result = await pool.query(query, [messageId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMessage(result.rows[0]);
  }

  /**
   * List messages with filters
   */
  async list(filters: {
    connectionId?: string;
    threadId?: string;
    type?: string;
    direction?: MessageDirection;
    state?: MessageState;
    fromDid?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: Message[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (filters.connectionId) {
      paramCount++;
      conditions.push(`connection_id = $${paramCount}`);
      values.push(filters.connectionId);
    }

    if (filters.threadId) {
      paramCount++;
      conditions.push(`thread_id = $${paramCount}`);
      values.push(filters.threadId);
    }

    if (filters.type) {
      paramCount++;
      conditions.push(`type = $${paramCount}`);
      values.push(filters.type);
    }

    if (filters.direction) {
      paramCount++;
      conditions.push(`direction = $${paramCount}`);
      values.push(filters.direction);
    }

    if (filters.state) {
      paramCount++;
      conditions.push(`state = $${paramCount}`);
      values.push(filters.state);
    }

    if (filters.fromDid) {
      paramCount++;
      conditions.push(`from_did = $${paramCount}`);
      values.push(filters.fromDid);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count total
    const countQuery = `SELECT COUNT(*) FROM messages ${whereClause}`;
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
      SELECT * FROM messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, [...values, limit, offset]);

    return {
      messages: result.rows.map(row => this.mapRowToMessage(row)),
      total,
    };
  }

  /**
   * Update message state
   */
  async updateState(id: string, state: MessageState, errorMessage?: string): Promise<Message> {
    const query = `
      UPDATE messages
      SET state = $1, error_message = $2, processed_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [state, errorMessage || null, id]);

    if (result.rows.length === 0) {
      throw new MessageError('Message not found', 'MESSAGE_NOT_FOUND', { id });
    }

    logger.info('Message state updated', {
      messageId: id,
      newState: state,
    });

    return this.mapRowToMessage(result.rows[0]);
  }

  /**
   * Increment retry count
   */
  async incrementRetry(id: string): Promise<Message> {
    const query = `
      UPDATE messages
      SET retry_count = retry_count + 1
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new MessageError('Message not found', 'MESSAGE_NOT_FOUND', { id });
    }

    return this.mapRowToMessage(result.rows[0]);
  }

  /**
   * Get messages by thread
   */
  async findByThread(threadId: string): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query, [threadId]);
    return result.rows.map(row => this.mapRowToMessage(row));
  }

  /**
   * Search messages by text
   */
  async search(searchText: string, filters: {
    connectionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: Message[]; total: number }> {
    const conditions: string[] = ['tsv @@ plainto_tsquery($1)'];
    const values: unknown[] = [searchText];
    let paramCount = 1;

    if (filters.connectionId) {
      paramCount++;
      conditions.push(`connection_id = $${paramCount}`);
      values.push(filters.connectionId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total
    const countQuery = `SELECT COUNT(*) FROM messages ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const query = `
      SELECT * FROM messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, [...values, limit, offset]);

    return {
      messages: result.rows.map(row => this.mapRowToMessage(row)),
      total,
    };
  }

  /**
   * Delete message
   */
  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM messages WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      throw new MessageError('Message not found', 'MESSAGE_NOT_FOUND', { id });
    }

    logger.info('Message deleted', { messageId: id });
  }

  /**
   * Map database row to Message object
   */
  private mapRowToMessage(row: {
    id: string;
    message_id: string;
    thread_id?: string | null;
    parent_id?: string | null;
    connection_id?: string | null;
    type: string;
    direction: MessageDirection;
    from_did: string;
    to_dids: string[];
    body: Record<string, unknown>;
    attachments?: unknown[] | null;
    state: MessageState;
    error_message?: string | null;
    retry_count?: number;
    metadata?: Record<string, unknown> | null;
    created_at: Date;
    processed_at?: Date | null;
  }): Message {
    return {
      id: row.id,
      messageId: row.message_id,
      threadId: row.thread_id ?? undefined,
      parentId: row.parent_id ?? undefined,
      connectionId: row.connection_id ?? undefined,
      type: row.type,
      direction: row.direction,
      fromDid: row.from_did,
      toDids: row.to_dids,
      body: row.body,
      attachments: row.attachments || [],
      state: row.state,
      errorMessage: row.error_message ?? undefined,
      retryCount: row.retry_count ?? 0,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      processedAt: row.processed_at ?? undefined,
    };
  }
}

export const messageRepository = new MessageRepository();