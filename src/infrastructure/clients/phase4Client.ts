// src/infrastructure/clients/Phase4Client.ts
// Replace the entire file with this version with proper type assertions:

import { config } from '../../config';
import { logger } from '../../utils/logger';
import { Phase4Error } from '../../utils/errors';
import {
  DIDDocument,
  DIDRecord,
  CreateDIDRequest,
  EncryptRequest,
  EncryptResponse,
  DecryptRequest,
  DecryptResponse,
  SignJWSRequest,
  SignJWSResponse,
  VerifyJWSRequest,
  VerifyJWSResponse,
  VerifySignatureRequest,
  VerifySignatureResponse,
  StatusEntry,
  DIDResolutionResult,
  DIDListFilters,
} from '../../types/didcomm.types';

// Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Enhanced Phase 4 API Client
 * 
 * Comprehensive integration with Phase 4 DID Service providing:
 * - DID creation and management (web, peer, key methods)
 * - DIDComm encryption/decryption (anoncrypt & authcrypt)
 * - JWT/JWS signing and verification
 * - DID lifecycle operations (suspend, reactivate, revoke)
 * - Status management
 * - DID resolution
 */
export class Phase4Client {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = config.phase4.baseUrl;
    this.timeout = config.phase4.timeout;
  }

  // ============================================
  // DID CREATION AND MANAGEMENT
  // ============================================

  /**
   * Create a new DID
   * 
   * Supports did:web, did:peer, and did:key methods
   * 
   * @param request - DID creation parameters
   * @returns Created DID record
   */
  async createDID(request: CreateDIDRequest): Promise<DIDRecord> {
    logger.info('Creating DID via Phase 4', { method: request.method });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to create DID: ${error.message || response.statusText}`,
          'DID_CREATION_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<DIDRecord>;
      logger.info('DID created', { did: data.data.did, method: request.method });
      return data.data;
    } catch (error) {
      logger.error('Error creating DID', { error: error instanceof Error ? error.message : 'Unknown error', method: request.method });
      throw error;
    }
  }

  /**
   * List all DIDs with optional filters
   * 
   * @param filters - Optional method and status filters
   * @returns Array of DID records
   */
  async listDIDs(filters?: DIDListFilters): Promise<DIDRecord[]> {
    logger.debug('Listing DIDs via Phase 4', { filters });

    try {
      const params = new URLSearchParams();
      if (filters?.method) params.append('method', filters.method);
      if (filters?.status) params.append('status', filters.status);

      const url = `${this.baseUrl}/api/v1/dids${params.toString() ? '?' + params.toString() : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to list DIDs: ${response.statusText}`,
          'DID_LIST_FAILED',
          { status: response.status }
        );
      }

      const data = await response.json() as ApiResponse<DIDRecord[]>;
      return data.data || [];
    } catch (error) {
      logger.error('Error listing DIDs', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get DID record by internal ID
   * 
   * @param id - Internal DID record ID
   * @returns DID record
   */
  async getDIDRecord(id: string): Promise<DIDRecord> {
    logger.debug('Getting DID record via Phase 4', { id });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${id}`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.status === 404) {
        throw new Phase4Error('DID record not found', 'DID_NOT_FOUND', { id });
      }

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to get DID record: ${response.statusText}`,
          'DID_GET_FAILED',
          { status: response.status, id }
        );
      }

      const data = await response.json() as ApiResponse<DIDRecord>;
      return data.data;
    } catch (error) {
      logger.error('Error getting DID record', { id, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get DID Document
   * 
   * Returns the DID Document for a given DID
   * 
   * @param did - The DID to resolve
   * @returns DID Document
   */
  async getDIDDocument(did: string): Promise<DIDDocument> {
    logger.debug('Fetching DID Document via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/document`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.status === 404) {
        throw new Phase4Error('DID Document not found', 'DID_NOT_FOUND', { did });
      }

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to fetch DID Document: ${response.statusText}`,
          'DID_RESOLUTION_FAILED',
          { status: response.status, did }
        );
      }

        // The /document endpoint returns the DID Document directly (not wrapped)
      const didDocument = await response.json() as DIDDocument;
      
      if (!didDocument || typeof didDocument !== 'object' || !didDocument.id) {
        logger.error('Invalid DID Document structure', { 
          did,
          hasId: !!didDocument?.id,
          receivedKeys: didDocument ? Object.keys(didDocument).slice(0, 10) : [],
        });
        throw new Phase4Error(
          'Invalid DID Document structure',
          'INVALID_DID_DOCUMENT',
          { did }
        );
      }

      logger.debug('DID Document fetched successfully', {
        did,
        hasService: !!didDocument.service,
        serviceCount: didDocument.service?.length || 0,
        hasVerificationMethod: !!didDocument.verificationMethod,
      });

      return didDocument;
    } catch (error) {
      logger.error('Error fetching DID Document', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Resolve DID (full W3C DID resolution)
   * 
   * Returns complete DID resolution result including metadata
   * 
   * @param did - The DID to resolve
   * @returns Complete DID resolution result
   */
  async resolveDID(did: string): Promise<DIDResolutionResult> {
    logger.debug('Resolving DID via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/resolve`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.status === 404) {
        throw new Phase4Error('DID not found', 'DID_NOT_FOUND', { did });
      }

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to resolve DID: ${response.statusText}`,
          'DID_RESOLUTION_FAILED',
          { status: response.status, did }
        );
      }

      const data = await response.json() as ApiResponse<DIDResolutionResult>;
      return data.data;
    } catch (error) {
      logger.error('Error resolving DID', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  // ============================================
  // DIDCOMM ENCRYPTION & DECRYPTION
  // ============================================

  /**
   * Encrypt message using DIDComm
   * 
   * Supports both anoncrypt (ECDH-ES) and authcrypt (ECDH-1PU)
   * - Without 'from': anoncrypt (anonymous encryption)
   * - With 'from': authcrypt (authenticated encryption)
   * 
   * @param request - Encryption parameters
   * @returns Encrypted JWE and key information
   */
  async encrypt(request: EncryptRequest): Promise<EncryptResponse> {
    logger.debug('Encrypting message via Phase 4', {
      to: request.to,
      from: request.from,
      type: request.from ? 'authcrypt' : 'anoncrypt',
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/didcomm/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to encrypt message: ${error.message || response.statusText}`,
          'ENCRYPTION_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<EncryptResponse>;
      logger.debug('Message encrypted', { 
        kid: data.data.kid,
        type: request.from ? 'authcrypt' : 'anoncrypt',
      });
      return data.data;
    } catch (error) {
      logger.error('Error encrypting message', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Decrypt message using DIDComm
   * 
   * Supports both anoncrypt (ECDH-ES) and authcrypt (ECDH-1PU)
   * 
   * @param request - Decryption parameters
   * @returns Decrypted plaintext and header information
   */
  async decrypt(request: DecryptRequest): Promise<DecryptResponse> {
    logger.debug('Decrypting message via Phase 4', { did: request.did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/didcomm/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to decrypt message: ${error.message || response.statusText}`,
          'DECRYPTION_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<DecryptResponse>;
      logger.debug('Message decrypted', { kid: data.data.kid });
      return data.data;
    } catch (error) {
      logger.error('Error decrypting message', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  // ============================================
  // JWT/JWS SIGNING & VERIFICATION
  // ============================================

  /**
   * Sign JWT or JWS with DID
   * 
   * Supports both JWT (with claims) and JWS (payload signing)
   * 
   * @param did - The DID to sign with
   * @param request - Signing parameters
   * @returns Signed token
   */
  async signJWS(did: string, request: SignJWSRequest): Promise<SignJWSResponse> {
    logger.debug('Signing JWS via Phase 4', { did, type: request.type || 'jwt' });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/sign/jws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to sign JWS: ${error.message || response.statusText}`,
          'JWS_SIGNING_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<SignJWSResponse>;
      logger.debug('JWS signed', { did, type: data.data.type, keyId: data.data.keyId });
      return data.data;
    } catch (error) {
      logger.error('Error signing JWS', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Verify JWT or JWS with DID
   * 
   * Verifies signature and optionally checks status and claims
   * 
   * @param did - The DID that signed the token
   * @param request - Verification parameters
   * @returns Verification result with decoded content
   */
  async verifyJWS(did: string, request: VerifyJWSRequest): Promise<VerifyJWSResponse> {
    logger.debug('Verifying JWS via Phase 4', { did, type: request.type || 'jwt' });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/verify/jws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to verify JWS: ${error.message || response.statusText}`,
          'JWS_VERIFICATION_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<VerifyJWSResponse>;
      logger.debug('JWS verified', { 
        did, 
        verified: data.data.verified,
        keyId: data.data.keyId,
      });
      return data.data;
    } catch (error) {
      logger.error('Error verifying JWS', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Verify detached signature
   * 
   * Verifies a detached Ed25519 signature
   * 
   * @param did - The DID that created the signature
   * @param params - Signature verification parameters
   * @returns Verification result
   */
  async verifySignature(did: string, params: VerifySignatureRequest): Promise<VerifySignatureResponse> {
    logger.debug('Verifying signature via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/verify/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Phase4Error(
          `Failed to verify signature: ${error.message || response.statusText}`,
          'SIGNATURE_VERIFICATION_FAILED',
          { status: response.status, error }
        );
      }

      const data = await response.json() as ApiResponse<VerifySignatureResponse>;
      logger.debug('Signature verified', { 
        did, 
        verified: data.data.verified,
        keyId: data.data.keyId,
      });
      return data.data;
    } catch (error) {
      logger.error('Error verifying signature', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  // ============================================
  // DID LIFECYCLE MANAGEMENT
  // ============================================

  /**
   * Suspend DID
   * 
   * Temporarily suspends a DID
   * 
   * @param did - The DID to suspend
   */
  async suspendDID(did: string): Promise<void> {
    logger.info('Suspending DID via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/suspend`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to suspend DID: ${response.statusText}`,
          'DID_SUSPEND_FAILED',
          { status: response.status, did }
        );
      }

      logger.info('DID suspended', { did });
    } catch (error) {
      logger.error('Error suspending DID', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Reactivate DID
   * 
   * Reactivates a suspended DID
   * 
   * @param did - The DID to reactivate
   */
  async reactivateDID(did: string): Promise<void> {
    logger.info('Reactivating DID via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/reactivate`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to reactivate DID: ${response.statusText}`,
          'DID_REACTIVATE_FAILED',
          { status: response.status, did }
        );
      }

      logger.info('DID reactivated', { did });
    } catch (error) {
      logger.error('Error reactivating DID', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Revoke DID
   * 
   * Permanently revokes a DID (cannot be undone)
   * 
   * @param did - The DID to revoke
   */
  async revokeDID(did: string): Promise<void> {
    logger.info('Revoking DID via Phase 4', { did });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/dids/${encodeURIComponent(did)}/revoke`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to revoke DID: ${response.statusText}`,
          'DID_REVOKE_FAILED',
          { status: response.status, did }
        );
      }

      logger.info('DID revoked', { did });
    } catch (error) {
      logger.error('Error revoking DID', { did, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  // ============================================
  // STATUS MANAGEMENT
  // ============================================

  /**
   * Get document status by JTI
   * 
   * Retrieves the status of a document/credential by its JTI (JWT ID)
   * 
   * @param jti - The JTI to lookup
   * @returns Status entry
   */
  async getStatus(jti: string): Promise<StatusEntry> {
    logger.debug('Getting status via Phase 4', { jti });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status/${jti}`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.status === 404) {
        throw new Phase4Error('Status not found', 'STATUS_NOT_FOUND', { jti });
      }

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to get status: ${response.statusText}`,
          'STATUS_GET_FAILED',
          { status: response.status, jti }
        );
      }

      const data = await response.json() as ApiResponse<StatusEntry>;
      return data.data;
    } catch (error) {
      logger.error('Error getting status', { jti, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Revoke document status by JTI
   * 
   * Revokes a document/credential status
   * 
   * @param jti - The JTI to revoke
   * @param reason - Optional reason for revocation
   */
  async revokeStatus(jti: string, reason?: string): Promise<void> {
    logger.info('Revoking status via Phase 4', { jti, reason });

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status/${jti}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Phase4Error(
          `Failed to revoke status: ${response.statusText}`,
          'STATUS_REVOKE_FAILED',
          { status: response.status, jti }
        );
      }

      logger.info('Status revoked', { jti });
    } catch (error) {
      logger.error('Error revoking status', { jti, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const phase4Client = new Phase4Client();