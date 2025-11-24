jest.mock('uuid', () => ({ v4: () => 'uuid-fixed' }));
import { ConnectionProtocol } from '../../src/core/protocols/ConnectionProtocol';
import { protocolRegistry } from '../../src/core/protocols/ProtocolRegistry';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { messageRouter } from '../../src/core/messages/MessageRouter';
import { capabilityDiscovery } from '../../src/core/discovery/CapabilityDiscovery';
import { didManager } from '../../src/core/did/DIDManager';
import { clearDatabase } from '../helpers/database.helper';

jest.mock('../../src/core/messages/MessageRouter', () => ({
  messageRouter: { routeOutbound: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/core/discovery/CapabilityDiscovery', () => ({
  capabilityDiscovery: { discoverCapabilities: jest.fn(async () => ({ endpoint: 'https://invitee.endpoint/messages', protocols: ['https://didcomm.org/connections/1.0'], services: [] })) },
}));

jest.mock('../../src/core/did/DIDManager', () => ({
  didManager: { getDIDDocument: jest.fn(async (did: string) => ({ '@context': ['https://www.w3.org/ns/did/v1'], id: did, verificationMethod: [{ id: `${did}#key-1` }], service: [] })) },
}));

describe('ConnectionProtocol', () => {
  const protocol = new ConnectionProtocol();

  beforeAll(() => {
    protocolRegistry.register(protocol);
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  test('handle request auto-sends response', async () => {
    const requestMessage = {
      type: 'https://didcomm.org/connections/1.0/request',
      id: 'req-1',
      from: 'did:peer:invitee1',
      to: ['did:peer:inviter1'],
      body: { label: 'Invitee' },
    } as any;

    await protocol.handle(requestMessage, {
      direction: 'inbound', transport: 'http', encrypted: true,
      receivedAt: new Date(),
    });

    expect(messageRouter.routeOutbound).toHaveBeenCalled();
    const [responseMsg] = (messageRouter.routeOutbound as jest.Mock).mock.calls[0];
    expect(responseMsg.type).toBe('https://didcomm.org/connections/1.0/response');
  });

  test('handle response progresses to responded', async () => {
    // Create connection in requested state
    const connection = await connectionRepository.create({
      myDid: 'did:peer:invitee2',
      theirDid: 'did:peer:inviter2',
      state: 'requested',
      role: 'invitee',
      theirEndpoint: 'https://inviter.endpoint/messages',
    });

    const responseMessage = {
      type: 'https://didcomm.org/connections/1.0/response',
      id: 'resp-1',
      from: 'did:peer:inviter2',
      to: ['did:peer:invitee2'],
      body: { did: 'did:peer:inviter2' },
    } as any;

    await protocol.handle(responseMessage, {
      direction: 'inbound', transport: 'http', encrypted: true,
      receivedAt: new Date(),
    });

    const updated = await connectionRepository.findById(connection.id);
    expect(updated?.state).toBe('responded');
  });

  test('handle ack completes responded connection', async () => {
    const connection = await connectionRepository.create({
      myDid: 'did:peer:invitee3',
      theirDid: 'did:peer:inviter3',
      state: 'responded',
      role: 'invitee',
      theirEndpoint: 'https://inviter.endpoint/messages',
    });

    const ackMessage = {
      type: 'https://didcomm.org/connections/1.0/ack',
      id: 'ack-1',
      from: 'did:peer:inviter3',
      to: ['did:peer:invitee3'],
      body: {},
    } as any;

    await protocol.handle(ackMessage, {
      direction: 'inbound', transport: 'http', encrypted: true,
      receivedAt: new Date(),
    });
    const updated = await connectionRepository.findById(connection.id);
    expect(updated?.state).toBe('complete');
  });

  test('handle ack when already complete leaves state unchanged', async () => {
    const connection = await connectionRepository.create({
      myDid: 'did:peer:invitee4',
      theirDid: 'did:peer:inviter4',
      state: 'complete',
      role: 'invitee',
      theirEndpoint: 'https://inviter.endpoint/messages',
    });

    const ackMessage = {
      type: 'https://didcomm.org/connections/1.0/ack',
      id: 'ack-2',
      from: 'did:peer:inviter4',
      to: ['did:peer:invitee4'],
      body: {},
    } as any;

    await protocol.handle(ackMessage, { direction: 'inbound', transport: 'http', encrypted: true, receivedAt: new Date() });
    const updated = await connectionRepository.findById(connection.id);
    expect(updated?.state).toBe('complete');
  });
});
