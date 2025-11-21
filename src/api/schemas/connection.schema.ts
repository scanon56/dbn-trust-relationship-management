// src/api/schemas/connection.schema.ts
import { z } from 'zod';

export const createInvitationSchema = z.object({
  myDid: z.string().min(1, 'myDid is required'),
  label: z.string().optional(),
  goalCode: z.string().optional(),
  goal: z.string().optional(),
  targetDid: z.string().optional(),
});

export const acceptInvitationSchema = z.object({
  invitation: z.union([z.string(), z.record(z.string(), z.unknown())]),
  myDid: z.string().min(1, 'myDid is required'),
  label: z.string().optional(),
});

export const updateConnectionMetadataSchema = z.object({
  theirLabel: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listConnectionsQuerySchema = z.object({
  myDid: z.string().optional(),
  state: z.enum(['invited', 'requested', 'responded', 'active', 'completed', 'error']).optional(),
  protocols: z.string().optional(), // Comma-separated
  tags: z.string().optional(), // Comma-separated
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type UpdateConnectionMetadataInput = z.infer<typeof updateConnectionMetadataSchema>;
export type ListConnectionsQuery = z.infer<typeof listConnectionsQuerySchema>;