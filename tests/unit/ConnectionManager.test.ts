// Mock uuid to avoid ESM import issues under ts-jest
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { connectionManager } from '../../src/core/connections/ConnectionManager';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { capabilityDiscovery } from '../../src/core/discovery/CapabilityDiscovery';
import { ConnectionError } from '../../src/utils/errors';
import { Connection, OutOfBandInvitation } from '../../src/types/connection.types';

function makeConnection(partial: Partial<Connection>): Connection {
  return {
    id: partial.id || 'conn-1',
    myDid: partial.myDid || 'did:example:alice',
    theirDid: partial.theirDid || 'did:example:bob',
    theirLabel: partial.theirLabel,
    state: partial.state || 'invited',
    role: partial.role || 'inviter',
    theirEndpoint: partial.theirEndpoint,
    theirProtocols: partial.theirProtocols || [],
    theirServices: partial.theirServices || [],
    invitation: partial.invitation,
    invitationUrl: partial.invitationUrl,
    tags: partial.tags || [],
    notes: partial.notes,
    metadata: partial.metadata || {},
    createdAt: partial.createdAt || new Date(),
    updatedAt: partial.updatedAt || new Date(),
    lastActiveAt: partial.lastActiveAt,
  };
}

describe('ConnectionManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('createInvitation creates connection with inviter role and invited state', async () => {
    const createSpy = jest.spyOn(connectionRepository, 'create').mockResolvedValue(
      makeConnection({ id: 'inv-1', state: 'invited', role: 'inviter' })
    );

    const { connection, invitationUrl, invitation } = await connectionManager.createInvitation({
      myDid: 'did:example:alice',
      label: 'Alice',
      goal: 'Establish business connection',
      goalCode: 'establish-connection'
    });

    expect(createSpy).toHaveBeenCalled();
    expect(connection.state).toBe('invited');
    expect(connection.role).toBe('inviter');
    expect(invitation['@type']).toBe('https://didcomm.org/out-of-band/2.0/invitation');
    expect(invitationUrl).toMatch(/_oob=/);
  });

  test('acceptInvitation parses URL and creates invitee connection', async () => {
    // Build a fake invitation and encode similar to manager private method
    const invitation: OutOfBandInvitation = {
      '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
      '@id': '123',
      label: 'Alice Agent',
      services: [
        {
          id: '#didcomm',
          type: 'DIDCommMessaging',
          serviceEndpoint: 'http://localhost:3001/didcomm'
        }
      ]
    };
    const encoded = Buffer.from(JSON.stringify(invitation)).toString('base64url');
    const invitationUrl = `https://didcomm.org/oob?_oob=${encoded}`;

    jest.spyOn(connectionRepository, 'findByDids').mockResolvedValue(null);
    const createSpy = jest.spyOn(connectionRepository, 'create').mockResolvedValue(
      makeConnection({ id: 'conn-accepted', state: 'requested', role: 'invitee', invitation })
    );

    const connection = await connectionManager.acceptInvitation({
      invitation: invitationUrl,
      myDid: 'did:example:bob',
      label: 'Bob Agent'
    });

    expect(createSpy).toHaveBeenCalled();
    expect(connection.state).toBe('requested');
    expect(connection.role).toBe('invitee');
  });

  test('acceptInvitation throws when connection already exists', async () => {
    const invitation: OutOfBandInvitation = {
      '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
      '@id': '456',
      services: [ { id: '#didcomm', type: 'DIDCommMessaging', serviceEndpoint: 'http://x' } ]
    };
    const encoded = Buffer.from(JSON.stringify(invitation)).toString('base64url');
    const invitationUrl = `https://didcomm.org/oob?_oob=${encoded}`;

    jest.spyOn(connectionRepository, 'findByDids').mockResolvedValue(
      makeConnection({ id: 'existing', myDid: 'did:example:bob', theirDid: 'did:unknown:inviter' })
    );

    await expect(
      connectionManager.acceptInvitation({ invitation: invitationUrl, myDid: 'did:example:bob' })
    ).rejects.toThrow(ConnectionError);
  });

  test('acceptInvitation rejects invalid URL', async () => {
    await expect(
      connectionManager.acceptInvitation({ invitation: 'https://didcomm.org/oob?missing', myDid: 'did:example:bob' })
    ).rejects.toThrow(ConnectionError);
  });

  test('getConnection throws when not found', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(null);
    await expect(connectionManager.getConnection('nope')).rejects.toThrow(ConnectionError);
  });

  test('updateConnectionState validates transition and updates state', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'state-1', state: 'invited' })
    );
    const updateSpy = jest.spyOn(connectionRepository, 'updateState').mockResolvedValue(
      makeConnection({ id: 'state-1', state: 'requested' })
    );
    const updated = await connectionManager.updateConnectionState('state-1', 'requested');
    expect(updateSpy).toHaveBeenCalledWith('state-1', 'requested');
    expect(updated.state).toBe('requested');
  });

  test('ping succeeds for active connection and fails otherwise', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValueOnce(
      makeConnection({ id: 'active-1', state: 'active' })
    );
    const ok = await connectionManager.ping('active-1');
    expect(ok.success).toBe(true);

    jest.spyOn(connectionRepository, 'findById').mockResolvedValueOnce(
      makeConnection({ id: 'invited-1', state: 'invited' })
    );
    await expect(connectionManager.ping('invited-1')).rejects.toThrow(ConnectionError);
  });

  test('refreshCapabilities updates connection with discovered data', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'cap-1', state: 'active', theirDid: 'did:example:peer' })
    );
    const discoverSpy = jest.spyOn(capabilityDiscovery, 'discoverCapabilities').mockResolvedValue({
      endpoint: 'https://peer.example.com/didcomm',
      protocols: ['https://didcomm.org/basicmessage/2.0'],
      services: [
        { id: '#svc1', type: 'DIDCommMessaging', serviceEndpoint: 'https://peer.example.com/didcomm', protocols: ['https://didcomm.org/basicmessage/2.0'] }
      ]
    });
    const updateSpy = jest.spyOn(connectionRepository, 'updateCapabilities').mockResolvedValue(
      makeConnection({ id: 'cap-1', state: 'active', theirDid: 'did:example:peer', theirEndpoint: 'https://peer.example.com/didcomm', theirProtocols: ['https://didcomm.org/basicmessage/2.0'] })
    );
    const updated = await connectionManager.refreshCapabilities('cap-1');
    expect(discoverSpy).toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalled();
    expect(updated.theirEndpoint).toBe('https://peer.example.com/didcomm');
  });

  test('refreshCapabilities throws when theirDid unknown', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'cap-2', state: 'active', theirDid: 'did:unknown:inviter' })
    );
    await expect(connectionManager.refreshCapabilities('cap-2')).rejects.toThrow(ConnectionError);
  });

  test('refreshCapabilities propagates discovery errors', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'cap-err', state: 'active', theirDid: 'did:example:peer2' })
    );
    jest.spyOn(capabilityDiscovery, 'discoverCapabilities').mockRejectedValue(new Error('network')); 
    await expect(connectionManager.refreshCapabilities('cap-err')).rejects.toThrow('network');
  });

  test('listConnections forwards filters to repository', async () => {
    const listSpy = jest.spyOn(connectionRepository, 'list').mockResolvedValue({ connections: [], total: 0 });
    const filters = { myDid: 'did:example:alice', state: 'active' as const, limit: 10, offset: 0 };
    const result = await connectionManager.listConnections(filters);
    expect(listSpy).toHaveBeenCalledWith(filters);
    expect(result.total).toBe(0);
  });

  test('updateMetadata calls repository after existence check', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'meta-1', state: 'active' })
    );
    const updateSpy = jest.spyOn(connectionRepository, 'updateMetadata').mockResolvedValue(
      makeConnection({ id: 'meta-1', state: 'active', theirLabel: 'Bob', tags: ['a'], metadata: { note: 'x' } })
    );
    const updated = await connectionManager.updateMetadata('meta-1', { theirLabel: 'Bob', tags: ['a'], metadata: { note: 'x' } });
    expect(updateSpy).toHaveBeenCalled();
    expect(updated.theirLabel).toBe('Bob');
    expect(updated.tags).toContain('a');
  });

  test('deleteConnection deletes after existence check', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'del-1', state: 'active' })
    );
    const deleteSpy = jest.spyOn(connectionRepository, 'delete').mockResolvedValue();
    await connectionManager.deleteConnection('del-1');
    expect(deleteSpy).toHaveBeenCalledWith('del-1');
  });

  test('updateConnectionState invalid transition throws', async () => {
    jest.spyOn(connectionRepository, 'findById').mockResolvedValue(
      makeConnection({ id: 'inv-2', state: 'invited' })
    );
    await expect(connectionManager.updateConnectionState('inv-2', 'active')).rejects.toThrow(ConnectionError);
  });
});
