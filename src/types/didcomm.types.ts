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
  id?: string;
  service?: DIDDocumentService[];
  [key: string]: unknown;
}