import { connectionManager } from '../../src/core/connections/ConnectionManager';
import { didManager } from '../../src/core/did/DIDManager';
import { phase4Client } from '../../src/infrastructure/clients/phase4Client';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { pool } from '../../src/infrastructure/database/pool';
// Mock uuid to avoid ESM parse issues in Jest
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
// Mock outbound message routing to prevent network/transport dependency
jest.mock('../../src/core/messages/MessageRouter', () => ({
  messageRouter: { routeOutbound: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/infrastructure/clients/phase4Client');
const mockedPhase4 = jest.mocked(phase4Client);

// Minimal DID Document builder
function buildDidDoc(did: string, endpoint: string) {
  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    verificationMethod: [{ id: `${did}#key-1`, type: 'Ed25519VerificationKey2020' }],
    service: [
      {
        id: `${did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: endpoint,
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
          'https://didcomm.org/trust-ping/2.0',
        ],
      },
    ],
  } as any;
}

describe('Integration: Invitation + Acceptance DID flow', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await pool.query('DELETE FROM connections');
  });

  test('createInvitation then acceptInvitation populates DID capabilities', async () => {
    // Mock peer DID creation for inviter (createInvitation) and invitee (acceptInvitation)
    const inviterPeerRecord = { id: 'peer-rec-1', did: 'did:peer:inviter123', method: 'peer', methodId: 'inviter123', status: 'active', version: 1, metadata: { baseDid: 'did:web:example.com:alice' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any;
    const inviteePeerRecord = { id: 'peer-rec-2', did: 'did:peer:invitee456', method: 'peer', methodId: 'invitee456', status: 'active', version: 1, metadata: { baseDid: 'did:web:example.com:bob' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any;

    // createInvitation sequence: create peer DID, then fetch its DID Document
    mockedPhase4.createDID.mockResolvedValueOnce(inviterPeerRecord); // peer DID for inviter
    mockedPhase4.getDIDDocument.mockResolvedValueOnce(buildDidDoc(inviterPeerRecord.did, 'https://inviter-endpoint')); // inviter peer DID document

    // acceptInvitation sequence:
    // 1. get inviter DID Document
    mockedPhase4.getDIDDocument.mockResolvedValueOnce(buildDidDoc(inviterPeerRecord.did, 'https://inviter-endpoint'));
    // 2. create invitee peer DID
    mockedPhase4.createDID.mockResolvedValueOnce(inviteePeerRecord);
    // 3. get invitee peer DID Document
    mockedPhase4.getDIDDocument.mockResolvedValueOnce(buildDidDoc(inviteePeerRecord.did, 'https://invitee-endpoint'));

    const invitationResult = await connectionManager.createInvitation({
      myDid: 'did:web:example.com:alice',
      label: 'Alice',
    });

    expect(invitationResult.connection.state).toBe('invited');
    expect(invitationResult.connection.myDid).toBe(inviterPeerRecord.did);
    expect(invitationResult.invitation.services[0]).toBeDefined();

    const acceptedConnection = await connectionManager.acceptInvitation({
      invitation: invitationResult.invitationUrl,
      myDid: 'did:web:example.com:bob',
      label: 'Bob',
    });

    expect(acceptedConnection.state).toBe('requested');
    expect(acceptedConnection.theirDid).toBe(inviterPeerRecord.did);
    expect(acceptedConnection.myDid).toBe(inviteePeerRecord.did);
    expect(acceptedConnection.theirProtocols.length).toBeGreaterThan(0);
    expect(acceptedConnection.theirEndpoint).toBe('https://inviter-endpoint');

    // Ensure repository stored capabilities
    const fetched = await connectionRepository.findById(acceptedConnection.id);
    expect(fetched?.theirProtocols).toEqual(acceptedConnection.theirProtocols);

    // Activate connection and confirm state progression
    const activated = await connectionManager.activateConnection(acceptedConnection.id);
    expect(activated.state).toBe('active');
  });
});