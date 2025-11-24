import request from 'supertest';
process.env.SKIP_DELIVERY = 'true';
// Mocks BEFORE importing app
jest.mock('uuid', () => { let c=0; return { v4: () => `uuid-basicmsg-${++c}` }; });
jest.mock('../../src/infrastructure/clients/phase4Client', () => ({
  phase4Client: {
    encrypt: jest.fn(async () => ({ jwe: 'ciphertext', kid: 'kid123' })),
    decrypt: jest.fn(),
  },
}));
import app from '../../src/server';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { clearDatabase } from '../helpers/database.helper';

// Helper: create a fake complete connection directly (bypassing handshake for test speed)
let connCounter = 0;
async function seedConnection() {
  const suffix = connCounter++;
  return connectionRepository.create({
    myDid: `did:peer:me-test-${suffix}`,
    theirDid: `did:peer:them-test-${suffix}`,
    state: 'complete',
    role: 'inviter',
    theirEndpoint: 'https://example.com/didcomm'
  });
}

describe('POST /api/v1/basicmessages', () => {
  beforeEach(async () => {
    await clearDatabase();
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
  });
  test('sends a basic message via shortcut', async () => {
    const connection = await seedConnection();

    const res = await request(app)
      .post('/api/v1/basicmessages')
      .send({ connectionId: connection.id, content: 'Hello shortcut', lang: 'en' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.message.type).toBe('https://didcomm.org/basicmessage/2.0/message');
    expect(res.body.data.message.body.content).toBe('Hello shortcut');
  });

  test('rejects missing content', async () => {
    const connection = await seedConnection();
    const res = await request(app)
      .post('/api/v1/basicmessages')
      .send({ connectionId: connection.id })
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});
