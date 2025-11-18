// src/types/protocol.types.ts
import { DIDCommMessage } from './didcomm.types';
import { Connection } from './connection.types';

export interface MessageContext {
  connectionId?: string;
  connection?: Connection; // Full connection object if available
  direction: 'inbound' | 'outbound';
  transport: 'http' | 'websocket';
  encrypted: boolean;
}

export interface ProtocolHandler {
  /**
   * Protocol type URI (e.g., 'https://didcomm.org/basicmessage/2.0')
   */
  readonly type: string;

  /**
   * Human-readable protocol name
   */
  readonly name: string;

  /**
   * Protocol version
   */
  readonly version: string;

  /**
   * Handle incoming message for this protocol
   */
  handle(message: DIDCommMessage, context: MessageContext): Promise<void>;

  /**
   * Check if this handler supports a specific message type
   */
  supports(messageType: string): boolean;
}