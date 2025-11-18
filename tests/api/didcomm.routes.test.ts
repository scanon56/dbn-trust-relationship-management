import request from 'supertest';
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }));
import app from '../../src/server';
import { phase4Client } from '../../src/infrastructure/clients/phase4Client';

jest.mock('../../src/infrastructure/clients/phase4Client', () => ({
  phase4Client: {
    decrypt: jest.fn(async () => ({ plaintext: JSON.stringify({ id: 'm1', type: 'https://didcomm.org/basicmessage/2.0/message', from: 'did:example:alice', to: ['did:example:bob'], body: { content: 'hi' } }), header: {}, kid: 'kid123' })),
  },
}));

describe('DIDComm Routes', () => {
  it('rejects invalid content type', async () => {
    const res = await request(app).post('/didcomm?did=did:example:bob').set('Content-Type', 'application/json').send({});
    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
  });

  it('requires recipient DID', async () => {
    const res = await request(app).post('/didcomm').set('Content-Type', 'application/didcomm-encrypted+json').send('ciphertext');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_RECIPIENT_DID');
  });

  it('accepts message and returns 202', async () => {
    const res = await request(app).post('/didcomm?did=did:example:bob').set('Content-Type', 'application/didcomm-encrypted+json').send('ciphertext');
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
  });

  it('health check returns healthy', async () => {
    const res = await request(app).get('/didcomm/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('healthy');
  });
});
