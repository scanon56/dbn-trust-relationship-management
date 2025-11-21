import { connectionManager } from '../../src/core/connections/ConnectionManager';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { didManager } from '../../src/core/did/DIDManager';
import { OutOfBandInvitation } from '../../src/types/connection.types';
import { messageRouter } from '../../src/core/messages/MessageRouter';
import { ConnectionError } from '../../src/utils/errors';
import { pool } from '../../src/infrastructure/database/pool';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/core/did/DIDManager');
jest.mock('../../src/core/messages/MessageRouter');

const mockedDidManager = jest.mocked(didManager);
const mockedMessageRouter = jest.mocked(messageRouter);

describe('ConnectionManager unit tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await pool.query('DELETE FROM connections');
  });

  const buildInvitation = (targetDid?: string): OutOfBandInvitation => ({
    '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
    '@id': 'inv-1',
    label: 'Alice',
    services: [
      {
        id: 'did:peer:alice#didcomm',
        type: 'DIDCommMessaging',
        serviceEndpoint: 'https://endpoint.alice',
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
        ],
      },
    ],
    ...(targetDid ? { 'dbn:target': targetDid } : {}),
  });

  const didDoc = (did: string, endpoint: string) => ({
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    verificationMethod: [{}],
    service: [
      {
        id: `${did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: endpoint,
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
        ],
      },
    ],
  });

  test('acceptInvitation targeted wrong DID throws INVITATION_NOT_FOR_YOU', async () => {
    const invitation = buildInvitation('did:web:example.com:alice');
    await expect(
      connectionManager.acceptInvitation({ invitation, myDid: 'did:web:example.com:bob' })
    ).rejects.toBeInstanceOf(ConnectionError);
  });

  test('acceptInvitation creates connection with protocols and endpoint', async () => {
    const invitation = buildInvitation();
    mockedDidManager.getDIDDocument.mockResolvedValueOnce(didDoc('did:peer:alice', 'https://endpoint.alice'));
    mockedDidManager.createPeerDIDForConnection.mockResolvedValueOnce({
      record: { id: 'peer-rec-bob', did: 'did:peer:bob', method: 'peer', methodId: 'bob', status: 'active', version: 1, metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any,
      didDocument: didDoc('did:peer:bob', 'https://endpoint.bob'),
    });
    mockedDidManager.getDIDDocument.mockResolvedValueOnce(didDoc('did:peer:alice', 'https://endpoint.alice'));
    mockedDidManager.extractServiceEndpoint.mockReturnValue('https://endpoint.alice');
    mockedDidManager.extractProtocols.mockReturnValue([
      'https://didcomm.org/connections/1.0',
      'https://didcomm.org/basicmessage/2.0',
    ]);
    mockedDidManager.extractServices.mockReturnValue([
      {
        id: 'did:peer:alice#didcomm',
        type: 'DIDCommMessaging',
        serviceEndpoint: 'https://endpoint.alice',
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
        ],
      },
    ] as any);
    mockedMessageRouter.routeOutbound.mockResolvedValue(undefined);

    const connection = await connectionManager.acceptInvitation({ invitation, myDid: 'did:web:example.com:bob' });
    expect(connection.state).toBe('requested');
    expect(connection.theirEndpoint).toBe('https://endpoint.alice');
    expect(connection.theirProtocols).toContain('https://didcomm.org/connections/1.0');
  });

  test('activateConnection progresses states to active', async () => {
    const created = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'invited',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    const activated = await connectionManager.activateConnection(created.id);
    expect(activated.state).toBe('active');
  });

  test('refreshCapabilities updates endpoint and protocols', async () => {
    const created = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'invited',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    mockedDidManager.getDIDDocument.mockResolvedValueOnce(didDoc('did:peer:bob', 'https://endpoint.bob'));
    mockedDidManager.extractServiceEndpoint.mockReturnValue('https://endpoint.bob');
    mockedDidManager.extractProtocols.mockReturnValue([
      'https://didcomm.org/connections/1.0',
      'https://didcomm.org/basicmessage/2.0',
    ]);
    mockedDidManager.extractServices.mockReturnValue([
      {
        id: 'did:peer:bob#didcomm',
        type: 'DIDCommMessaging',
        serviceEndpoint: 'https://endpoint.bob',
        protocols: [
          'https://didcomm.org/connections/1.0',
          'https://didcomm.org/basicmessage/2.0',
        ],
      },
    ] as any);
    const updated = await connectionManager.refreshCapabilities(created.id);
    expect(updated.theirEndpoint).toBe('https://endpoint.bob');
    expect(updated.theirProtocols.length).toBeGreaterThan(0);
  });

  test('activateConnection idempotency returns unchanged active connection', async () => {
    const active = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'active',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    const updateSpy = jest.spyOn(connectionRepository, 'updateState');
    const result = await connectionManager.activateConnection(active.id);
    expect(result.state).toBe('active');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('ping success path returns success true', async () => {
    const active = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'active',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    mockedMessageRouter.routeOutbound.mockResolvedValueOnce(undefined);
    const res = await connectionManager.ping(active.id);
    expect(res.success).toBe(true);
    expect(typeof res.responseTime).toBe('number');
  });

  test('ping failure path returns success false when routing fails', async () => {
    const active = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'active',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    mockedMessageRouter.routeOutbound.mockRejectedValueOnce(new Error('transport failure'));
    const res = await connectionManager.ping(active.id);
    expect(res.success).toBe(false);
  });

  test('ping non-active connection throws ConnectionError', async () => {
    const invited = await connectionRepository.create({
      myDid: 'did:peer:alice',
      theirDid: 'did:peer:bob',
      state: 'invited',
      role: 'inviter',
      invitation: null,
      invitationUrl: undefined,
      metadata: {},
    });
    await expect(connectionManager.ping(invited.id)).rejects.toBeInstanceOf(ConnectionError);
  });
});
