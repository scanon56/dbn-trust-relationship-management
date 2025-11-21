import { didManager } from '../../src/core/did/DIDManager';
import { phase4Client } from '../../src/infrastructure/clients/phase4Client';
import { ConnectionError } from '../../src/utils/errors';
// Mock uuid to avoid ESM parsing issues in Jest
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

jest.mock('../../src/infrastructure/clients/phase4Client');

const mockedPhase4 = jest.mocked(phase4Client);

describe('DIDManager unit tests', () => {
  const peerDidRecord = { id: 'rec-peer-1', did: 'did:peer:123abc', method: 'peer', methodId: '123abc', status: 'active', version: 1, metadata: { baseDid: 'did:web:example.com:alice' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any;
  const keyDidRecord = { id: 'rec-key-1', did: 'did:key:z6Mk...', method: 'key', methodId: 'z6Mk...', status: 'active', version: 1, metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any;

  const peerDidDocument = {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: peerDidRecord.did,
    verificationMethod: [{ id: `${peerDidRecord.did}#key-1`, type: 'Ed25519VerificationKey2020' }],
    service: [
      {
        id: `${peerDidRecord.did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: 'https://example.com/didcomm',
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
          'https://didcomm.org/basicmessage/2.0', // duplicate intentional
        ],
      },
    ],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createPeerDIDForConnection success path', async () => {
    mockedPhase4.createDID.mockResolvedValue(peerDidRecord);
    mockedPhase4.getDIDDocument.mockResolvedValue(peerDidDocument);

    const result = await didManager.createPeerDIDForConnection('did:web:example.com:alice', 'conn-1');
    expect(result.record.did).toBe(peerDidRecord.did);
    expect(Array.isArray(result.didDocument.service)).toBe(true);
    const firstService: any = (result.didDocument.service as any[])[0];
    expect(firstService.serviceEndpoint).toBe('https://example.com/didcomm');
    expect(mockedPhase4.createDID).toHaveBeenCalledWith(expect.objectContaining({ method: 'peer' }));
    expect(mockedPhase4.getDIDDocument).toHaveBeenCalledWith(peerDidRecord.did);
  });

  test('createPeerDIDForConnection error path throws ConnectionError', async () => {
    mockedPhase4.createDID.mockRejectedValue(new Error('network fail'));
    await expect(didManager.createPeerDIDForConnection('did:web:example.com:alice', 'conn-2')).rejects.toBeInstanceOf(ConnectionError);
  });

  test('extractServiceEndpoint returns endpoint for string serviceEndpoint', () => {
    const endpoint = didManager.extractServiceEndpoint(peerDidDocument);
    expect(endpoint).toBe('https://example.com/didcomm');
  });

  test('extractServiceEndpoint returns undefined when no DIDComm service', () => {
    const doc = { '@context': 'x', id: 'did:peer:none', verificationMethod: [{}], service: [{ id: 'svc1', type: 'Other', serviceEndpoint: 'https://other' }] } as any;
    expect(didManager.extractServiceEndpoint(doc)).toBeUndefined();
  });

  test('extractProtocols deduplicates protocols', () => {
    const protocols = didManager.extractProtocols(peerDidDocument);
    expect(protocols).toContain('https://didcomm.org/connections/1.0');
    const basicMsgCount = protocols.filter(p => p === 'https://didcomm.org/basicmessage/2.0').length;
    expect(basicMsgCount).toBe(1);
  });

  test('extractServiceEndpoint handles object with uri', () => {
    const objDoc = {
      '@context': 'https://www.w3.org/ns/did/v1',
      id: 'did:peer:object1',
      verificationMethod: [{}],
      service: [
        { id: 'svc1', type: 'DIDCommMessaging', serviceEndpoint: { uri: 'https://object-endpoint' } },
      ],
    } as any;
    expect(didManager.extractServiceEndpoint(objDoc)).toBe('https://object-endpoint');
  });

  test('verifyDIDDocument unknown method returns true', async () => {
    const unknownDoc = { ...peerDidDocument, id: 'did:example:abc' };
    const verified = await didManager.verifyDIDDocument(unknownDoc);
    expect(verified).toBe(true);
  });

  test('verifyDIDDocument missing @context returns false', async () => {
    const invalidDoc = { ...peerDidDocument } as any;
    delete invalidDoc['@context'];
    const verified = await didManager.verifyDIDDocument(invalidDoc);
    expect(verified).toBe(false);
  });

  test('verifyDIDDocument missing verification methods returns false', async () => {
    const invalidDoc = { ...peerDidDocument, verificationMethod: [] };
    const verified = await didManager.verifyDIDDocument(invalidDoc as any);
    expect(verified).toBe(false);
  });

  test('extractServices returns full service array', () => {
    const services = didManager.extractServices(peerDidDocument);
    expect(services.length).toBe(1);
    expect(services[0].type).toBe('DIDCommMessaging');
  });

  test('verifyDIDDocument returns true for peer DID with valid structure', async () => {
    const verified = await didManager.verifyDIDDocument(peerDidDocument);
    expect(verified).toBe(true);
  });

  test('verifyDIDDocument web DID mismatch returns false', async () => {
    const webDoc = { ...peerDidDocument, id: 'did:web:example.com:alice' };
    mockedPhase4.getDIDDocument.mockResolvedValue({ ...webDoc, service: [] }); // Different doc
    const verified = await didManager.verifyDIDDocument(webDoc);
    expect(mockedPhase4.getDIDDocument).toHaveBeenCalledWith(webDoc.id);
    expect(verified).toBe(false);
  });

  test('listPeerDIDsForBaseDID filters by metadata.baseDid', async () => {
    mockedPhase4.listDIDs.mockResolvedValue([
      peerDidRecord,
      { ...peerDidRecord, id: 'other', did: 'did:peer:xyz', metadata: { baseDid: 'did:web:other' } },
    ]);
    const list = await didManager.listPeerDIDsForBaseDID('did:web:example.com:alice');
    expect(list).toHaveLength(1);
    expect(list[0].did).toBe(peerDidRecord.did);
  });

  test('deactivatePeerDID swallows errors', async () => {
    mockedPhase4.revokeDID.mockRejectedValue(new Error('boom'));
    await expect(didManager.deactivatePeerDID('did:peer:123abc')).resolves.toBeUndefined();
  });
});