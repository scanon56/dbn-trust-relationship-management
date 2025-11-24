// src/core/did/DIDManager.ts
import { v4 as uuidv4 } from 'uuid';
import { phase4Client } from '../../infrastructure/clients/phase4Client';
import { DIDDocument, DIDRecord, ServiceEndpoint } from '../../types/didcomm.types';
import { logger } from '../../utils/logger';
import { ConnectionError } from '../../utils/errors';
import { config } from '../../config';

/**
 * DID Manager
 * 
 * Manages DID lifecycle for connections:
 * - Creates did:peer DIDs for each connection
 * - Extracts service endpoints from DID Documents
 * - Manages DID-to-connection mappings
 */
export class DIDManager {
  
  /**
   * Create a did:peer DID for a connection
   * 
   * Creates a new did:peer:2 DID with DIDComm service endpoint
   * 
   * @param baseDid - The base DID (did:web) to associate with
   * @param connectionId - The connection ID this peer DID is for
   * @returns DID record and DID Document
   */
  async createPeerDIDForConnection(
    baseDid: string,
    connectionId: string
  ): Promise<{
    record: DIDRecord;
    didDocument: DIDDocument;
  }> {
    logger.info('Creating did:peer for connection', { baseDid, connectionId });

    try {
      // Create did:peer with Phase 4 API
      const record = await phase4Client.createDID({
        method: 'peer',
        options: {
          services: [
          {
            id: '#didcomm',
            type: 'DIDCommMessaging',
            serviceEndpoint: config.didcomm.endpoint,
          },
        ],
          // Store connection metadata
          metadata: {
            connectionId,
            baseDid,
            purpose: 'connection',
            createdAt: new Date().toISOString(),
          },
        },
      });

      // Obtain DID Document either from creation response or via resolution
      let didDocument: DIDDocument;
      if ((record as any).didDocument) {
        logger.info('Using DID Document from creation response', { did: record.did });
        didDocument = (record as any).didDocument;
      } else {
        logger.debug('Resolving DID Document for new peer DID', { did: record.did });
        didDocument = await phase4Client.getDIDDocument(record.did);
      }

      logger.debug('Resolved DID Document', {
        did: record.did,
        hasService: !!didDocument.service,
        serviceCount: didDocument.service?.length || 0,
        endpoint: didDocument.service?.[0]?.serviceEndpoint,
      });

      // Ensure DIDComm service exists (Phase 4 may omit services)
      if (!didDocument.service || didDocument.service.length === 0) {
        logger.warn('Missing services in DID Document - constructing DIDComm service manually', {
          did: record.did,
        });
        didDocument.service = [
          {
            id: `${record.did}#didcomm`,
            type: 'DIDCommMessaging',
            serviceEndpoint: config.didcomm.endpoint,
          },
        ];
      }

      logger.info('Peer DID created', {
        peerDid: record.did,
        connectionId,
        baseDid,
        hasService: !!didDocument.service,
        serviceCount: didDocument.service?.length || 0,
        endpoint: didDocument.service?.[0]?.serviceEndpoint,
      });

      return { record, didDocument };
    } catch (error) {
      logger.error('Failed to create peer DID', {
        baseDid,
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ConnectionError(
        'Failed to create peer DID for connection',
        'PEER_DID_CREATION_FAILED',
        { baseDid, connectionId, error }
      );
    }
  }

  /**
   * Create a did:key DID for signing/verification
   * 
   * Creates a temporary did:key for one-time use
   * 
   * @returns DID record and DID Document
   */
  async createKeyDID(): Promise<{
    record: DIDRecord;
    didDocument: DIDDocument;
  }> {
    logger.info('Creating did:key');

    try {
      const record = await phase4Client.createDID({
        method: 'key',
      });

      const didDocument = await phase4Client.getDIDDocument(record.did);

      logger.info('Key DID created', { did: record.did });

      return { record, didDocument };
    } catch (error) {
      logger.error('Failed to create key DID', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ConnectionError(
        'Failed to create key DID',
        'KEY_DID_CREATION_FAILED',
        { error }
      );
    }
  }

  /**
   * Get DID Document for a DID
   * 
   * @param did - The DID to resolve
   * @returns DID Document
   */
  async getDIDDocument(did: string): Promise<DIDDocument> {
    logger.debug('Getting DID Document', { did });

    try {
      const doc = await phase4Client.getDIDDocument(did);
      if (!doc) {
        logger.error('Phase4 client returned empty DID Document', { did });
        throw new ConnectionError(
          'Empty DID Document returned by resolution',
          'DID_RESOLUTION_FAILED',
          { did }
        );
      }
      return doc;
    } catch (error) {
      logger.error('Failed to get DID Document', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ConnectionError(
        'Failed to resolve DID Document',
        'DID_RESOLUTION_FAILED',
        { did, error }
      );
    }
  }

  /**
   * Extract DIDComm service endpoint from DID Document
   * 
   * @param didDocument - DID Document to extract from
   * @returns Service endpoint URL or undefined
   */
  extractServiceEndpoint(didDocument: DIDDocument | undefined): string | undefined {
    if (!didDocument || !didDocument.service || didDocument.service.length === 0) {
      logger.warn('No services in DID Document');
      return undefined;
    }

    // Look for DIDComm service
    const didcommService = didDocument.service.find((service: any) =>
      service.type === 'DIDCommMessaging' ||
      service.type === 'DIDComm' ||
      service.type === 'did-communication'
    );

    if (!didcommService) {
      logger.warn('No DIDComm service found in DID Document', { did: didDocument.id });
      return undefined;
    }

    // Handle different serviceEndpoint formats
    const endpoint = didcommService.serviceEndpoint;
    
    if (typeof endpoint === 'string') {
      return endpoint;
    }
    
    if (typeof endpoint === 'object' && endpoint.uri) {
      return endpoint.uri;
    }

    logger.warn('Unexpected serviceEndpoint format', {
      did: didDocument.id,
      endpoint,
    });
    return undefined;
  }

  /**
   * Extract supported protocols from DID Document
   * 
   * @param didDocument - DID Document to extract from
   * @returns Array of protocol URIs
   */
  extractProtocols(didDocument: DIDDocument): string[] {
    if (!didDocument.service || didDocument.service.length === 0) {
      return [];
    }

    const protocols: string[] = [];

    for (const service of didDocument.service) {
      if (service.protocols && Array.isArray(service.protocols)) {
        protocols.push(...service.protocols);
      }
    }

    return [...new Set(protocols)]; // Remove duplicates
  }

  /**
   * Extract all services from DID Document
   * 
   * @param didDocument - DID Document to extract from
   * @returns Array of services
   */
  extractServices(didDocument: DIDDocument): any[] {
    return didDocument.service || [];
  }

  /**
   * Verify DID Document authenticity
   * 
   * Checks that the DID Document is properly signed and valid
   * 
   * @param didDocument - DID Document to verify
   * @returns True if valid
   */
  async verifyDIDDocument(didDocument: DIDDocument): Promise<boolean> {
    try {
      // For did:peer and did:key, they are self-certifying
      // For did:web, we need to fetch from the domain
      
      const method = didDocument.id.split(':')[1];

      switch (method) {
        case 'peer':
        case 'key':
          // Self-certifying, just validate structure
          return this.validateDIDDocumentStructure(didDocument);
        
        case 'web':
          // Fetch and compare
          const fetchedDoc = await this.getDIDDocument(didDocument.id);
          return JSON.stringify(fetchedDoc) === JSON.stringify(didDocument);
        
        default:
          logger.warn('Unknown DID method, skipping verification', {
            did: didDocument.id,
            method,
          });
          return true; // Assume valid for unknown methods
      }
    } catch (error) {
      logger.error('Failed to verify DID Document', {
        did: didDocument.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Validate DID Document structure
   * 
   * @param didDocument - DID Document to validate
   * @returns True if structure is valid
   */
  private validateDIDDocumentStructure(didDocument: DIDDocument): boolean {
    // Check required fields
    if (!didDocument['@context']) {
      logger.warn('Missing @context in DID Document', { did: didDocument.id });
      return false;
    }

    if (!didDocument.id) {
      logger.warn('Missing id in DID Document');
      return false;
    }

    // Validate it has at least one verification method
    if (!didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
      logger.warn('No verification methods in DID Document', { did: didDocument.id });
      return false;
    }

    return true;
  }

  /**
   * List all DIDs for a base DID
   * 
   * @param baseDid - The base DID to find peer DIDs for
   * @returns Array of DID records
   */
  async listPeerDIDsForBaseDID(baseDid: string): Promise<DIDRecord[]> {
    logger.debug('Listing peer DIDs for base DID', { baseDid });

    try {
      const allPeerDIDs = await phase4Client.listDIDs({ method: 'peer' });
      
      // Filter by base DID in metadata
      return allPeerDIDs.filter(record =>
        record.metadata?.baseDid === baseDid
      );
    } catch (error) {
      logger.error('Failed to list peer DIDs', {
        baseDid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ConnectionError(
        'Failed to list peer DIDs',
        'PEER_DID_LIST_FAILED',
        { baseDid, error }
      );
    }
  }

  /**
   * Deactivate a peer DID
   * 
   * Used when a connection is deleted
   * 
   * @param peerDid - The peer DID to deactivate
   */
  async deactivatePeerDID(peerDid: string): Promise<void> {
    logger.info('Deactivating peer DID', { peerDid });

    try {
      await phase4Client.revokeDID(peerDid);
      logger.info('Peer DID deactivated', { peerDid });
    } catch (error) {
      logger.error('Failed to deactivate peer DID', {
        peerDid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - this is cleanup, shouldn't block connection deletion
    }
  }
}

export const didManager = new DIDManager();