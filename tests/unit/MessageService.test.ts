import { clearDatabase } from '../helpers/database.helper';
// Mock uuid to avoid ESM parse issues
jest.mock('uuid', () => ({ v4: () => 'uuid-fixed' }));
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { messageRepository } from '../../src/core/messages/MessageRepository';
import { messageService } from '../../src/core/messages/MessageService';
import { messageRouter } from '../../src/core/messages/MessageRouter';
import { MessageError } from '../../src/utils/errors';

// Mock Phase4 client and fetch for routing
jest.mock('../../src/infrastructure/clients/phase4Client', () => {
  return {
    phase4Client: {
      encrypt: jest.fn(async () => ({ jwe: 'cipher', kid: 'kid123' })),
      decrypt: jest.fn(),
    },
  };
});
const { phase4Client } = require('../../src/infrastructure/clients/phase4Client');

let counter = 0;
function uniqueDid(suffix: string) {
  counter += 1;
  return `did:example:${suffix}-${counter}`;
}

describe('MessageService', () => {
  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  test('sendMessage success returns stored sent message', async () => {
    // Prepare active connection
    const connection = await connectionRepository.create({
      myDid: uniqueDid('me'),
      theirDid: uniqueDid('them'),
      state: 'active',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    // Mock fetch to succeed
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));

    const stored = await messageService.sendMessage({
      connectionId: connection.id,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      body: { content: 'hi there' },
    });

    expect(stored.state).toBe('sent');
    expect(stored.direction).toBe('outbound');
    expect(stored.type).toBe('https://didcomm.org/basicmessage/2.0/message');
  });

  test('sendMessage throws when connection missing', async () => {
    await expect(
      messageService.sendMessage({
        connectionId: '00000000-0000-0000-0000-000000000000',
        type: 'https://didcomm.org/basicmessage/2.0/message',
        body: { content: 'x' },
      })
    ).rejects.toThrow(MessageError);
  });

  test('retryMessage success updates state to sent and increments retryCount', async () => {
    const connection = await connectionRepository.create({
      myDid: uniqueDid('me'),
      theirDid: uniqueDid('them'),
      state: 'active',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });

    // Create failed message manually
    const failed = await messageRepository.create({
      messageId: 'retry-1',
      connectionId: connection.id,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      direction: 'outbound',
      fromDid: connection.myDid,
      toDids: [connection.theirDid],
      body: { content: 'will retry' },
      state: 'failed',
      attachments: [],
    });

    // Mock fetch success for retry
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));

    const retried = await messageService.retryMessage(failed.id);
    expect(retried.state).toBe('sent');
    expect(retried.retryCount).toBe(1);
  });

  test('retryMessage throws for non-failed state', async () => {
    const connection = await connectionRepository.create({
      myDid: uniqueDid('me'),
      theirDid: uniqueDid('them'),
      state: 'active',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });
    const sent = await messageRepository.create({
      messageId: 'sent-1',
      connectionId: connection.id,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      direction: 'outbound',
      fromDid: connection.myDid,
      toDids: [connection.theirDid],
      body: { content: 'already sent' },
      state: 'sent',
      attachments: [],
    });
    await expect(messageService.retryMessage(sent.id)).rejects.toThrow(MessageError);
  });

  test('deleteMessage removes message', async () => {
    const connection = await connectionRepository.create({
      myDid: uniqueDid('me'),
      theirDid: uniqueDid('them'),
      state: 'active',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });
    const msg = await messageRepository.create({
      messageId: 'del-1',
      connectionId: connection.id,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      direction: 'outbound',
      fromDid: connection.myDid,
      toDids: [connection.theirDid],
      body: { content: 'to delete' },
      state: 'pending',
      attachments: [],
    });
    await messageService.deleteMessage(msg.id);
    const fetched = await messageRepository.findById(msg.id);
    expect(fetched).toBeNull();
  });
});
