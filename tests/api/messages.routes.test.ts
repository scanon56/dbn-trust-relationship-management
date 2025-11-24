import request from 'supertest';
jest.mock('uuid', () => { let c=0; return { v4: () => `uuid-test-${++c}` }; });
jest.mock('../../src/infrastructure/clients/phase4Client', () => ({
  phase4Client: {
    encrypt: jest.fn(async () => ({ jwe: 'ciphertext', kid: 'kid123' })),
    decrypt: jest.fn(),
  },
}));
import app from '../../src/server';
import { clearDatabase } from '../helpers/database.helper';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { messageRepository } from '../../src/core/messages/MessageRepository';

describe('Messages Routes', () => {
  let connectionId: string;

  beforeEach(async () => {
    await clearDatabase();
    const conn = await connectionRepository.create({
      myDid: 'did:example:sender',
      theirDid: 'did:example:receiver',
      state: 'complete',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });
    connectionId = conn.id;
  });

  it('sends message', async () => {
    // Mock fetch for delivery
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const res = await request(app).post('/api/v1/messages').send({
      connectionId,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      body: { content: 'hello world' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.message.type).toContain('basicmessage');
  });

  it('lists messages', async () => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 'msg1' } });
    await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 'msg2' } });
    const res = await request(app).get('/api/v1/messages');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('gets message by id', async () => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const created = await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 'get' } });
    const id = created.body.data.message.id;
    const res = await request(app).get(`/api/v1/messages/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.message.id).toBe(id);
  });

  it('gets thread messages', async () => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const threadId = 'thread-123';
    await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 't1' }, threadId });
    await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 't2' }, threadId });
    const res = await request(app).get(`/api/v1/messages/thread/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(2);
  });

  it('searches messages', async () => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 'alpha beta' } });
    const res = await request(app).get('/api/v1/messages/search').query({ q: 'alpha' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('retries failed message', async () => {
    // Create failed message directly
    const failed = await messageRepository.create({
      messageId: 'retry-direct',
      connectionId,
      type: 'https://didcomm.org/basicmessage/2.0/message',
      direction: 'outbound',
      fromDid: 'did:example:sender',
      toDids: ['did:example:receiver'],
      body: { content: 'will retry' },
      state: 'failed',
    });
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const res = await request(app).post(`/api/v1/messages/${failed.id}/retry`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.message.state).toBe('sent');
    expect(res.body.data.message.retryCount).toBe(1);
  });

  it('deletes message (subsequent get 400)', async () => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const created = await request(app).post('/api/v1/messages').send({ connectionId, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content: 'deleteme' } });
    const id = created.body.data.message.id;
    const res = await request(app).delete(`/api/v1/messages/${id}`);
    expect(res.status).toBe(200);
    const getRes = await request(app).get(`/api/v1/messages/${id}`);
    expect(getRes.status).toBe(400);
  });
});
