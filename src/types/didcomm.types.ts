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

export interface DIDCommPlaintextMessage extends DIDCommMessage {
  // Plaintext version of DIDComm message
}

export interface DIDCommEncryptedMessage {
  // JWE encrypted message (string)
  ciphertext: string;
  protected: string;
  recipients: unknown[];
  iv: string;
  tag: string;
}