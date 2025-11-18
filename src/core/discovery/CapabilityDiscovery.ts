// src/core/discovery/CapabilityDiscovery.ts
import { phase4Client } from '../../infrastructure/clients/phase4Client';
import { logger } from '../../utils/logger';
import { ServiceEndpoint } from '../../types/connection.types';
import { DIDDocument, DIDDocumentService } from '../../types/didcomm.types';

export interface DiscoveredCapabilities {
  endpoint?: string;
  protocols: string[];
  services: ServiceEndpoint[];
}

export class CapabilityDiscovery {
  
  /**
   * Discover capabilities from a peer's DID Document
   */
  async discoverCapabilities(did: string): Promise<DiscoveredCapabilities> {
    logger.info('Discovering capabilities for DID', { did });

    try {
      // Resolve DID to get DID Document
      const didDocument: DIDDocument = await phase4Client.getDIDDocument(did);
      
      // Extract DIDComm service endpoints
      const services: DIDDocument['service'] = didDocument.service || [];
      const didcommServices = (services || []).filter((s: DIDDocumentService) => 
        this.isDIDCommService(s.type)
      );

      // Extract primary endpoint
      const primaryEndpoint = didcommServices.length > 0
        ? this.extractEndpoint(didcommServices[0].serviceEndpoint)
        : undefined;

      // Extract protocols from all services
      const protocols = new Set<string>();
      (services || []).forEach((service: DIDDocumentService) => {
        if (service.protocols && Array.isArray(service.protocols)) {
          service.protocols.forEach((p: string) => protocols.add(p));
        }
      });

      const capabilities: DiscoveredCapabilities = {
        endpoint: primaryEndpoint,
        protocols: Array.from(protocols),
        services: (services || []).map((s: DIDDocumentService) => ({
          id: s.id,
          type: s.type,
          serviceEndpoint: s.serviceEndpoint,
          protocols: s.protocols,
        })),
      };

      logger.info('Capabilities discovered', {
        did,
        endpoint: capabilities.endpoint,
        protocolCount: capabilities.protocols.length,
      });

      return capabilities;
    } catch (error) {
      logger.error('Failed to discover capabilities', { did, error });
      throw error;
    }
  }

  /**
   * Check if service type indicates DIDComm support
   */
  private isDIDCommService(type: string | string[]): boolean {
    const types = Array.isArray(type) ? type : [type];
    return types.some(t => 
      t === 'DIDCommMessaging' || 
      t.includes('DIDComm') ||
      t === 'MessagingService'
    );
  }

  /**
   * Extract endpoint URL from service endpoint
   */
  private extractEndpoint(serviceEndpoint: string | Record<string, unknown> | string[]): string | undefined {
    if (typeof serviceEndpoint === 'string') {
      return serviceEndpoint;
    }
    
    if (Array.isArray(serviceEndpoint) && serviceEndpoint.length > 0) {
      return serviceEndpoint[0];
    }
    
    if (typeof serviceEndpoint === 'object' && serviceEndpoint !== null) {
      // Handle object form like { uri: "..." }
      const endpoint = serviceEndpoint as { uri?: string; url?: string; serviceEndpoint?: string };
      return endpoint.uri || endpoint.url || endpoint.serviceEndpoint;
    }
    
    return undefined;
  }

  /**
   * Check if peer supports a specific protocol
   */
  async supportsProtocol(did: string, protocol: string): Promise<boolean> {
    try {
      const capabilities = await this.discoverCapabilities(did);
      return capabilities.protocols.includes(protocol);
    } catch (error) {
      logger.error('Failed to check protocol support', { did, protocol, error });
      return false;
    }
  }
}

export const capabilityDiscovery = new CapabilityDiscovery();