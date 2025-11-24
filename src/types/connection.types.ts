// src/types/connection.types.ts
// Standard Aries Connection Protocol states (RFC 0160):
// invited -> requested -> responded -> complete
// 'error' retained for internal error handling.
// Backward compatibility: legacy 'active'/'completed' will be mapped to 'complete' when read.
export type ConnectionState = 
  | 'invited'
  | 'requested'
  | 'responded'
  | 'complete'
  | 'error';

export type ConnectionRole = 'inviter' | 'invitee';

export interface Connection {
  id: string;
  myDid: string;
  theirDid: string;
  theirLabel?: string;
  state: ConnectionState;
  role: ConnectionRole;
  theirEndpoint?: string;
  theirProtocols: string[];
  theirServices: ServiceEndpoint[];
  invitation?: OutOfBandInvitation;
  invitationUrl?: string;
  tags: string[];
  notes?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
}

export interface ServiceEndpoint {
  id: string;
  type: string | string[];
  serviceEndpoint: string | Record<string, unknown>;
  protocols?: string[];
}

export interface OutOfBandInvitation {
  '@type': 'https://didcomm.org/out-of-band/2.0/invitation';
  '@id': string;
  label?: string;
  goal_code?: string;
  goal?: string;
  accept?: string[];
  services: Array<string | ServiceEndpoint>;
  'dbn:target'?: string;
  // Correlation identifier used to tie logs across invitation lifecycle
  'dbn:cid'?: string;
}

export interface CreateInvitationParams {
  myDid: string;
  label?: string;
  goalCode?: string;
  goal?: string;
  targetDid?: string;
}

export interface AcceptInvitationParams {
  invitation: string | OutOfBandInvitation;
  myDid: string;
  label?: string;
}