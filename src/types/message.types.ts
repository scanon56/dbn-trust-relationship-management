// src/types/message.types.ts
export type MessageDirection = 'inbound' | 'outbound';
export type MessageState = 'pending' | 'sent' | 'delivered' | 'failed' | 'processed';

export interface Message {
  id: string;
  messageId: string;
  threadId?: string;
  parentId?: string;
  connectionId?: string;
  type: string;
  direction: MessageDirection;
  fromDid: string;
  toDids: string[];
  body: Record<string, unknown>;
  attachments: unknown[];
  state: MessageState;
  errorMessage?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
}

export interface SendMessageParams {
  connectionId: string;
  type: string;
  body: Record<string, unknown>;
  threadId?: string;
  parentId?: string;
}