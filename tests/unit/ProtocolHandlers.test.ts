import { clearDatabase } from '../helpers/database.helper';
import { BasicMessageProtocol } from '../../src/core/protocols/BasicMessageProtocol';
import { TrustPingProtocol } from '../../src/core/protocols/TrustPingProtocol';
import { ConnectionProtocol } from '../../src/core/protocols/ConnectionProtocol';
import { messageRepository } from '../../src/core/messages/MessageRepository';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { MessageContext } from '../../src/types/protocol.types';
import { protocolRegistry } from '../../src/core/protocols';
import { capabilityDiscovery } from '../../src/core/discovery/CapabilityDiscovery';

jest.mock('uuid', () => ({ v4: () => 'uuid-fixed' }));

describe('Protocol Handlers', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('BasicMessageProtocol handles and stores message', async () => {
    const handler = new BasicMessageProtocol();
    const context: MessageContext = {
      connectionId: undefined,
      direction: 'inbound',
      transport: 'http',
      encrypted: false,
      receivedAt: new Date(),
    };

    const message = {
      id: 'basic-1',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      body: { content: 'hi basic' },
      from: 'did:example:alice',
      to: ['did:example:bob'],
    } as any;

    await handler.handle(message, context);
    const stored = await messageRepository.findByMessageId('basic-1');
    expect(stored).toBeTruthy();
    expect(stored!.state).toBe('processed');
    expect(stored!.body.content).toBe('hi basic');
  });

  test('TrustPingProtocol ping with response_requested true queues response and may complete connection', async () => {
    // Use responded state so ping can finalize connection
    const connection = await connectionRepository.create({
      myDid: 'did:example:me',
      theirDid: 'did:example:them',
      state: 'responded',
      role: 'inviter',
    });

    const handler = new TrustPingProtocol();
    const context: MessageContext = {
      connectionId: connection.id,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };

    const pingMsg = {
      id: 'ping-1',
      type: 'https://didcomm.org/trust-ping/2.0/ping',
      from: connection.theirDid,
      to: [connection.myDid],
      body: { comment: 'ping' },
    } as any;

    await handler.handle(pingMsg, context);

    const inbound = await messageRepository.findByMessageId('ping-1');
    expect(inbound).toBeTruthy();
    expect(inbound!.state).toBe('processed');

    // Response message queued with pending state
    const response = await messageRepository.findByMessageId('uuid-fixed');
    expect(response).toBeTruthy();
    expect(response!.state).toBe('pending');

    // Connection should be complete now
    const updatedConnection = await connectionRepository.findById(connection.id);
    expect(updatedConnection!.state).toBe('complete');
  });

  test('TrustPingProtocol ping with response_requested false does not queue response', async () => {
    const connection = await connectionRepository.create({
      myDid: 'did:example:me2',
      theirDid: 'did:example:them2',
      state: 'requested',
      role: 'inviter',
    });
    const handler = new TrustPingProtocol();
    const context: MessageContext = {
      connectionId: connection.id,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const pingMsg = {
      id: 'ping-2',
      type: 'https://didcomm.org/trust-ping/2.0/ping',
      from: connection.theirDid,
      to: [connection.myDid],
      body: { comment: 'ping', response_requested: false },
    } as any;
    await handler.handle(pingMsg, context);
    const response = await messageRepository.findByMessageId('uuid-fixed');
    expect(response).toBeNull();
  });

  test('ConnectionProtocol handleRequest creates connection and stores message', async () => {
    const handler = new ConnectionProtocol();
    const context: MessageContext = {
      connectionId: undefined,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };

    const reqMsg = {
      id: 'conn-req-1',
      type: 'https://didcomm.org/connections/1.0/request',
      from: 'did:example:invitee',
      to: ['did:example:inviter'],
      thid: 'thread-1',
      body: { label: 'Invitee' },
    } as any;

    await handler.handle(reqMsg, context);
    const stored = await messageRepository.findByMessageId('conn-req-1');
    expect(stored).toBeTruthy();
    const conn = await connectionRepository.findByDids('did:example:inviter', 'did:example:invitee');
    expect(conn).toBeTruthy();
    expect(conn!.state).toBe('requested');
  });

  test('ConnectionProtocol handleRequest continues on capability discovery failure', async () => {
    const handler = new ConnectionProtocol();
    const spy = jest.spyOn(capabilityDiscovery, 'discoverCapabilities').mockRejectedValueOnce(new Error('cap fail'));
    const context: MessageContext = {
      connectionId: undefined,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const reqMsg = {
      id: 'conn-req-fail-cap',
      type: 'https://didcomm.org/connections/1.0/request',
      from: 'did:example:inviteeX',
      to: ['did:example:inviterX'],
      thid: 'thread-fail-cap',
      body: { label: 'InviteeX' },
    } as any;
    await handler.handle(reqMsg, context);
    const conn = await connectionRepository.findByDids('did:example:inviterX', 'did:example:inviteeX');
    expect(conn).toBeTruthy();
    expect(conn!.state).toBe('requested');
    expect(spy).toHaveBeenCalled();
  });

  test('ConnectionProtocol handleResponse updates existing connection to responded', async () => {
    // Pre-create connection in requested state
    const connection = await connectionRepository.create({
      myDid: 'did:example:inviter2',
      theirDid: 'did:example:invitee2',
      state: 'requested',
      role: 'inviter',
    });
    const handler = new ConnectionProtocol();
    const context: MessageContext = {
      connectionId: connection.id,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const respMsg = {
      id: 'conn-resp-1',
      type: 'https://didcomm.org/connections/1.0/response',
      from: connection.theirDid,
      to: [connection.myDid],
      thid: 'thread-2',
      body: { label: 'Invitee2' },
    } as any;
    await handler.handle(respMsg, context);
    const updated = await connectionRepository.findById(connection.id);
    expect(updated!.state).toBe('responded');
  });

  test('ConnectionProtocol handleResponse stores message but no connection found', async () => {
    const handler = new ConnectionProtocol();
    const context: MessageContext = {
      connectionId: undefined,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const respMsg = {
      id: 'conn-resp-missing',
      type: 'https://didcomm.org/connections/1.0/response',
      from: 'did:example:unknownInvitee',
      to: ['did:example:unknownInviter'],
      thid: 'thread-missing',
      body: { label: 'Unknown' },
    } as any;
    await handler.handle(respMsg, context);
    const stored = await messageRepository.findByMessageId('conn-resp-missing');
    expect(stored).toBeTruthy();
    const conn = await connectionRepository.findByDids('did:example:unknownInviter', 'did:example:unknownInvitee');
    expect(conn).toBeNull();
  });

  test('ConnectionProtocol handleResponse continues on capability discovery failure', async () => {
    const connection = await connectionRepository.create({
      myDid: 'did:example:inviterFail',
      theirDid: 'did:example:inviteeFail',
      state: 'requested',
      role: 'inviter',
    });
    const spy = jest.spyOn(capabilityDiscovery, 'discoverCapabilities').mockRejectedValueOnce(new Error('cap fail resp'));
    const handler = new ConnectionProtocol();
    const context: MessageContext = {
      connectionId: connection.id,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const respMsg = {
      id: 'conn-resp-fail-cap',
      type: 'https://didcomm.org/connections/1.0/response',
      from: connection.theirDid,
      to: [connection.myDid],
      thid: 'thread-resp-fail-cap',
      body: {},
    } as any;
    await handler.handle(respMsg, context);
    const updated = await connectionRepository.findById(connection.id);
    expect(updated!.state).toBe('responded');
    expect(spy).toHaveBeenCalled();
  });

  test('ConnectionProtocol handleAck completes connection if not complete', async () => {
    const connection = await connectionRepository.create({
      myDid: 'did:example:inviter3',
      theirDid: 'did:example:invitee3',
      state: 'responded',
      role: 'inviter',
    });
    const handler = new ConnectionProtocol();
    const context: MessageContext = {
      connectionId: connection.id,
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      receivedAt: new Date(),
    };
    const ackMsg = {
      id: 'conn-ack-1',
      type: 'https://didcomm.org/connections/1.0/ack',
      from: connection.theirDid,
      to: [connection.myDid],
      thid: 'thread-3',
      body: {},
    } as any;
    await handler.handle(ackMsg, context);
    const updated = await connectionRepository.findById(connection.id);
    expect(updated!.state).toBe('complete');
  });
});
