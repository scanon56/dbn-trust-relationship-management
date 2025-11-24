import { clearDatabase } from '../helpers/database.helper';
// Mock uuid to avoid ESM parse issues
jest.mock('uuid', () => ({ v4: () => 'uuid-fixed' }));
import { messageRouter } from '../../src/core/messages/MessageRouter';
import { messageRepository } from '../../src/core/messages/MessageRepository';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { initializeProtocols } from '../../src/core/protocols';
import { MessageError } from '../../src/utils/errors';

// Mock Phase4 client
jest.mock('../../src/infrastructure/clients/phase4Client', () => {
  return {
    phase4Client: {
      encrypt: jest.fn(async ({ to, plaintext }: any) => ({ jwe: `encrypted:${to}`, kid: 'kid123' })),
      decrypt: jest.fn(async ({ jwe }: any) => ({ plaintext: jwe === 'FAIL' ? (() => { throw new Error('decrypt error'); })() : jwe, header: {}, kid: 'kid123' })),
    },
  };
});

const { phase4Client } = require('../../src/infrastructure/clients/phase4Client');

let counter = 0;
function uniquePair() {
  counter += 1;
  return { myDid: `did:example:me-${counter}`, theirDid: `did:example:them-${counter}` };
}

describe('MessageRouter', () => {
  beforeAll(async () => {
    initializeProtocols();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  test('routeOutbound success updates message state to sent', async () => {
    const pair = uniquePair();
    const connection = await connectionRepository.create({
      myDid: pair.myDid,
      theirDid: pair.theirDid,
      state: 'complete',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    // Mock fetch success
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    // @ts-ignore
    global.fetch = fetchMock;

    const message = {
      id: 'msg1',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: connection.myDid,
      to: [connection.theirDid],
      body: { content: 'hello' },
    };

    await messageRouter.routeOutbound(message as any, connection.id);

    const stored = await messageRepository.findByMessageId('msg1');
    expect(stored).toBeTruthy();
    expect(stored!.state).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('routeOutbound fails when connection inactive', async () => {
    const pair = uniquePair();
    const connection = await connectionRepository.create({
      myDid: pair.myDid,
      theirDid: pair.theirDid,
      state: 'requested',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    const message = {
      id: 'msg2',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: connection.myDid,
      to: [connection.theirDid],
      body: { content: 'hello' },
    };

    await expect(messageRouter.routeOutbound(message as any, connection.id)).rejects.toThrow(MessageError);
    const stored = await messageRepository.findByMessageId('msg2');
    expect(stored).toBeNull();
  });

  test('routeOutbound fails when no endpoint configured', async () => {
    const pair = uniquePair();
    const connection = await connectionRepository.create({
      myDid: pair.myDid,
      theirDid: pair.theirDid,
      state: 'complete',
      role: 'inviter',
    });

    const message = {
      id: 'msg3',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: connection.myDid,
      to: [connection.theirDid],
      body: { content: 'hello' },
    };

    await expect(messageRouter.routeOutbound(message as any, connection.id)).rejects.toThrow(MessageError);
    const stored = await messageRepository.findByMessageId('msg3');
    expect(stored).toBeNull();
  });

  test('routeOutbound encrypt failure sets message state failed', async () => {
    const pair = uniquePair();
    const connection = await connectionRepository.create({
      myDid: pair.myDid,
      theirDid: pair.theirDid,
      state: 'complete',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    (phase4Client.encrypt as jest.Mock).mockRejectedValueOnce(new Error('encrypt boom'));
    const fetchMock = jest.fn();
    // @ts-ignore
    global.fetch = fetchMock;

    const message = {
      id: 'msg4',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: connection.myDid,
      to: [connection.theirDid],
      body: { content: 'hello' },
    };

    await expect(messageRouter.routeOutbound(message as any, connection.id)).rejects.toThrow('encrypt boom');
    const stored = await messageRepository.findByMessageId('msg4');
    expect(stored).toBeTruthy();
    expect(stored!.state).toBe('failed');
    expect(stored!.errorMessage).toBe('encrypt boom');
  });

  test('routeOutbound delivery failure updates state failed', async () => {
    const pair = uniquePair();
    const connection = await connectionRepository.create({
      myDid: pair.myDid,
      theirDid: pair.theirDid,
      state: 'complete',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    // Encrypt succeeds
    (phase4Client.encrypt as jest.Mock).mockResolvedValueOnce({ jwe: 'cipher', kid: 'kid123' });
    // fetch fails
    const fetchMock = jest.fn(async () => ({ ok: false, status: 500, statusText: 'ERR', text: async () => 'fail' }));
    // @ts-ignore
    global.fetch = fetchMock;

    const message = {
      id: 'msg5',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: connection.myDid,
      to: [connection.theirDid],
      body: { content: 'hello' },
    };

    await expect(messageRouter.routeOutbound(message as any, connection.id)).rejects.toThrow(MessageError);
    const stored = await messageRepository.findByMessageId('msg5');
    expect(stored).toBeTruthy();
    expect(stored!.state).toBe('failed');
    expect(stored!.errorMessage).toMatch(/HTTP 500|Failed to deliver message/);
  });

  test('routeInbound success stores processed message via protocol handler', async () => {
    // Connection for linking
    const connection = await connectionRepository.create({
      myDid: 'did:example:recipient',
      theirDid: 'did:example:sender',
      state: 'complete',
      role: 'inviter',
      theirEndpoint: 'https://endpoint',
    });

    // Prepare plaintext DIDComm basic message
    const didcommMessage = JSON.stringify({
      id: 'inbound1',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: 'did:example:sender',
      to: ['did:example:recipient'],
      body: { content: 'hello inbound' },
    });
    (phase4Client.decrypt as jest.Mock).mockResolvedValueOnce({ plaintext: didcommMessage, header: {}, kid: 'kid123' });

    await messageRouter.routeInbound(didcommMessage, 'did:example:recipient');
    const stored = await messageRepository.findByMessageId('inbound1');
    expect(stored).toBeTruthy();
    expect(stored!.state).toBe('processed');
    expect(stored!.direction).toBe('inbound');
  });

  test('routeInbound decrypt failure throws MessageError', async () => {
    (phase4Client.decrypt as jest.Mock).mockRejectedValueOnce(new Error('decrypt fail'));
    await expect(messageRouter.routeInbound('encryptedFail', 'did:example:recipient')).rejects.toThrow(MessageError);
  });
});
