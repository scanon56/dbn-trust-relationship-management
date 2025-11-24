import { capabilityDiscovery } from '../../src/core/discovery/CapabilityDiscovery';
import { phase4Client } from '../../src/infrastructure/clients/phase4Client';

describe('CapabilityDiscovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('discoverCapabilities extracts DIDComm endpoint and protocols', async () => {
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:example:alice',
      service: [
        {
          id: '#didcomm-1',
          type: 'DIDCommMessaging',
          serviceEndpoint: { uri: 'https://agent.example.com/didcomm' },
          protocols: ['https://didcomm.org/basicmessage/2.0']
        },
        {
          id: '#other',
          type: 'MessagingService',
          serviceEndpoint: 'https://agent.example.com/alt',
          protocols: ['https://didcomm.org/trust-ping/2.0']
        }
      ]
    } as any;
    jest.spyOn(phase4Client, 'getDIDDocument').mockResolvedValue(didDocument);

    const caps = await capabilityDiscovery.discoverCapabilities('did:example:alice');
    expect(caps.endpoint).toBe('https://agent.example.com/didcomm');
    expect(caps.protocols.sort()).toEqual([
      'https://didcomm.org/basicmessage/2.0',
      'https://didcomm.org/trust-ping/2.0'
    ].sort());
    expect(caps.services).toHaveLength(2);
  });

  test('discoverCapabilities with no DIDComm service yields undefined endpoint', async () => {
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:example:bob',
      service: [
        {
          id: '#not-didcomm',
          type: 'OtherService',
          serviceEndpoint: 'https://example.com/x',
          protocols: ['proto:custom/1.0']
        }
      ]
    } as any;
    jest.spyOn(phase4Client, 'getDIDDocument').mockResolvedValue(didDocument);

    const caps = await capabilityDiscovery.discoverCapabilities('did:example:bob');
    expect(caps.endpoint).toBeUndefined();
    expect(caps.protocols).toEqual(['proto:custom/1.0']);
  });

  test('supportsProtocol returns true when protocol present', async () => {
    jest.spyOn(phase4Client, 'getDIDDocument').mockResolvedValue({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:example:peer',
      service: [
        { id: '#svc', type: 'DIDCommMessaging', serviceEndpoint: 'https://x', protocols: ['p1','p2'] }
      ]
    } as any);
    const result = await capabilityDiscovery.supportsProtocol('did:example:peer', 'p2');
    expect(result).toBe(true);
  });

  test('supportsProtocol returns false when protocol absent', async () => {
    jest.spyOn(phase4Client, 'getDIDDocument').mockResolvedValue({ '@context': ['https://www.w3.org/ns/did/v1'], id: 'did:example:peer', service: [] } as any);
    const result = await capabilityDiscovery.supportsProtocol('did:example:peer', 'pX');
    expect(result).toBe(false);
  });

  test('supportsProtocol returns false on discovery error', async () => {
    jest.spyOn(phase4Client, 'getDIDDocument').mockRejectedValue(new Error('network'));
    const result = await capabilityDiscovery.supportsProtocol('did:example:err', 'p2');
    expect(result).toBe(false);
  });
});
