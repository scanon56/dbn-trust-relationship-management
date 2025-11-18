// src/api/schemas/message.schema.ts
import { z } from 'zod';

export const sendMessageSchema = z.object({
  connectionId: z.string().uuid('Invalid connection ID'),
  type: z.string().min(1, 'Message type is required'),
  body: z.record(z.string(), z.unknown()).refine(
    (val) => Object.keys(val).length > 0,
    'Message body cannot be empty'
  ),
  threadId: z.string().optional(),
  parentId: z.string().uuid().optional(),
});

export const listMessagesQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  type: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  state: z.enum(['pending', 'sent', 'delivered', 'failed', 'processed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const searchMessagesQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  connectionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;