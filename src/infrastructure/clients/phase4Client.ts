// src/infrastructure/clients/Phase4Client.ts
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class Phase4Client {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = config.phase4.baseUrl;
    this.timeout = config.phase4.timeout;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    logger.debug('Phase4 API request', {
      method: options.method || 'GET',
      url: endpoint,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Phase4 API error', {
          status: response.status,
          url: endpoint,
          error: errorData,
        });
        throw new Error(
          `Phase4 API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      logger.debug('Phase4 API response', {
        status: response.status,
        url: endpoint,
      });

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Phase4 API timeout', { url: endpoint, timeout: this.timeout });
        throw new Error(`Phase4 API timeout after ${this.timeout}ms`);
      }
      
      logger.error('Phase4 API request failed', {
        url: endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // DID Document operations
  async getDIDDocument(did: string): Promise<any> {
    return this.request(`/api/v1/dids/${encodeURIComponent(did)}/document`);
  }

  async resolveDID(did: string): Promise<any> {
    return this.request(`/api/v1/dids/${encodeURIComponent(did)}/resolve`, {
      method: 'POST',
    });
  }

  // DIDComm encryption/decryption
  async encrypt(params: {
    to: string;
    plaintext: string;
    from?: string;
  }): Promise<{ jwe: string; kid: string; from?: string }> {
    const response = await this.request<{ data: any }>('/api/v1/didcomm/encrypt', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.data;
  }

  async decrypt(params: {
    did: string;
    jwe: string;
  }): Promise<{ plaintext: string; header: any; kid: string }> {
    const response = await this.request<{ data: any }>('/api/v1/didcomm/decrypt', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.data;
  }

  // JWS signing/verification
  async signJWS(
    did: string,
    params: {
      type: 'jwt' | 'jws';
      payload: any;
      keyId?: string;
    }
  ): Promise<{ token: string; keyId: string; type: string }> {
    const response = await this.request<{ data: any }>(
      `/api/v1/dids/${encodeURIComponent(did)}/sign/jws`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return response.data;
  }

  async verifyJWS(
    did: string,
    params: {
      token: string;
      type: 'jwt' | 'jws';
    }
  ): Promise<{
    verified: boolean;
    header: any;
    claims: any;
    payload: any;
    keyId: string;
  }> {
    const response = await this.request<{ data: any }>(
      `/api/v1/dids/${encodeURIComponent(did)}/verify/jws`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return response.data;
  }
}

export const phase4Client = new Phase4Client();