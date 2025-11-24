// src/types/didcomm.types.ts
export interface DIDCommMessage {
  id: string;
  type: string;
  from?: string;
  to?: string[];
  thid?: string;  // thread ID
  pthid?: string; // parent thread ID
  created_time?: number;
  expires_time?: number;
  body: Record<string, unknown>;
  attachments?: unknown[];
}

export interface Attachment {
  '@id': string;
  mime_type?: string;
  filename?: string;
  lastmod_time?: string;
  byte_count?: number;
  description?: string;
  data: {
    base64?: string;
    json?: any;
    links?: string[];
    jws?: {
      header: any;
      protected: string;
      signature: string;
     };
    };
  }

export type DIDCommPlaintextMessage = DIDCommMessage;

export interface DIDCommEncryptedMessage {
  // JWE encrypted message (string)
  ciphertext: string;
  protected: string;
  recipients: unknown[];
  iv: string;
  tag: string;
}

// Minimal DID Document shape used by capability discovery
export interface DIDDocumentService {
  id: string;
  type: string | string[];
  serviceEndpoint: string | string[] | { uri?: string; url?: string; serviceEndpoint?: string };
  protocols?: string[];
}



export interface DIDDocument {
  '@context': string | string[];
  id: string;
  verificationMethod?: any[];
  authentication?: any[];
  assertionMethod?: any[];
  keyAgreement?: any[];
  capabilityInvocation?: any[];
  capabilityDelegation?: any[];
  service?: any[];
  [key: string]: any;
}

export interface DIDRecord {
  id: string;
  did: string;
  method: 'web' | 'peer' | 'key';
  methodId: string;
  status: 'active' | 'suspended' | 'deactivated' | 'revoked';
  version: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string;
}

export interface CreateDIDRequest {
  method: 'web' | 'peer' | 'key';
  methodId?: string;
  options?: {
    publicKey?: string;
    serviceEndpoint?: string;
    [key: string]: any;
  };
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | { uri: string; accept?: string[]; routing_keys?: string[] };
  protocols?: string[];
}

export interface EncryptRequest {
  to: string;
  plaintext: string;
  from?: string;  // For authcrypt
}

export interface EncryptResponse {
  jwe: string;
  kid: string;
  from?: string;
}

export interface DecryptRequest {
  did: string;
  jwe: string;
}

export interface DecryptResponse {
  plaintext: string;
  header: Record<string, any>;
  kid: string;
}

export interface SignJWSRequest {
  type?: 'jwt' | 'jws';
  keyId?: string;
  claims?: Record<string, any>;
  issuer?: string;
  subject?: string;
  audience?: string;
  expirationSeconds?: number;
  registerStatus?: boolean;
  payload?: string | Record<string, any>;
}

export interface SignJWSResponse {
  token: string;
  keyId: string;
  type: 'jwt' | 'jws';
}

export interface VerifyJWSRequest {
  token: string;
  type?: 'jwt' | 'jws';
  keyId?: string;
  issuer?: string;
  audience?: string;
  requireStatus?: boolean;
  expectedJti?: string;
}

export interface VerifyJWSResponse {
  verified: boolean;
  header: Record<string, any>;
  claims?: Record<string, any>;
  payload?: Record<string, any>;
  keyId: string;
}

export interface VerifySignatureRequest {
  message: string;
  signature: string;
  encoding?: 'utf8' | 'base64url' | 'hex';
  keyId?: string;
}

export interface VerifySignatureResponse {
  verified: boolean;
  keyId: string;
}

export interface StatusEntry {
  jti: string;
  did: string;
  status: 'active' | 'revoked';
  issuedAt: string;
  revokedAt?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface DIDResolutionResult {
  didDocument: DIDDocument;
  didResolutionMetadata: Record<string, any>;
  didDocumentMetadata: Record<string, any>;
}

export interface DIDListFilters {
  method?: 'web' | 'peer' | 'key';
  status?: 'active' | 'suspended' | 'deactivated' | 'revoked';
}