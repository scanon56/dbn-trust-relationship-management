import http from 'http';
import app from '../../src/server';
import { phase4Client } from '../../src/infrastructure/clients/phase4Client';
import { pool } from '../../src/infrastructure/database/pool';
// Mock uuid consistently
jest.mock('uuid', () => ({ v4: () => 'uuid-inbound-test' }));
// Mock phase4Client decrypt only; leave other methods untouched
jest.mock('../../src/infrastructure/clients/phase4Client');
const mockedPhase4 = jest.mocked(phase4Client);

describe('Integration: Full inbound basicmessage flow', () => {
  let server: http.Server;
  let port: number;

  beforeAll(done => {
    server = app.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      done();
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean messages table to avoid interference (ignore errors if table absent)
    try { await pool.query('DELETE FROM messages'); } catch {}
  });

  test('POST /didcomm decrypts, routes, stores, and emits SSE event', async () => {
    const recipientDid = 'did:web:example.com:recipient';
    const inboundMessage = {
      id: 'basic-inbound-1',
      type: 'https://didcomm.org/basicmessage/2.0/message',
      from: 'did:web:example.com:sender',
      body: { content: 'Inbound Hello' },
      created_time: Math.floor(Date.now() / 1000),
    };
    mockedPhase4.decrypt.mockResolvedValueOnce({ plaintext: JSON.stringify(inboundMessage), kid: 'test-kid' } as any);

    // Start SSE subscription BEFORE sending inbound message
    const ssePayloadPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for SSE basicmessage event')), 8000);
      const req = http.get(`http://localhost:${port}/api/v1/events/basicmessages`, res => {
        expect(res.statusCode).toBe(200);
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buffer += chunk;
          if (buffer.includes('event: basicmessage') && buffer.includes('data:')) {
            const blocks = buffer.split(/\n\n/).filter(b => b.includes('event: basicmessage'));
            const block = blocks[blocks.length - 1];
            const dataLine = block.split(/\n/).find(l => l.startsWith('data:'));
            if (dataLine) {
              try {
                const jsonStr = dataLine.replace('data: ', '').trim();
                const payload = JSON.parse(jsonStr);
                clearTimeout(timeout);
                res.destroy();
                resolve(payload);
              } catch (e) {
                clearTimeout(timeout);
                res.destroy();
                reject(e);
              }
            }
          }
        });
        res.on('error', err => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      req.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Send encrypted (placeholder) DIDComm message to inbound endpoint
    const didcommResponse = await fetch(`http://localhost:${port}/didcomm?did=${encodeURIComponent(recipientDid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/didcomm-encrypted+json' },
      body: 'fake-jwe-placeholder',
    });
    expect(didcommResponse.status).toBe(202);
    const didcommJson: any = await didcommResponse.json();
    expect(didcommJson.success).toBe(true);

    // Await SSE event emission representing storage + protocol handling
    const ssePayload = await ssePayloadPromise;
    expect(ssePayload).toMatchObject({
      messageId: inboundMessage.id,
      content: inboundMessage.body.content,
    });
    // connectionId may be omitted entirely if undefined (JSON.stringify drops undefined)
    if ('connectionId' in ssePayload && ssePayload.connectionId) {
      expect(typeof ssePayload.connectionId).toBe('string');
    }

    // Verify phase4 decrypt called with recipient DID and provided JWE
    expect(mockedPhase4.decrypt).toHaveBeenCalledWith({ did: recipientDid, jwe: 'fake-jwe-placeholder' });

    // DB persistence assertion
    const dbResult = await pool.query("SELECT message_id, direction, body, state, metadata FROM messages WHERE message_id = $1", [inboundMessage.id]);
    expect(dbResult.rowCount).toBe(1);
    const row = dbResult.rows[0];
    expect(row.direction).toBe('inbound');
    expect(row.state).toBe('processed');
    expect(row.body?.content).toBe('Inbound Hello');
    expect(row.metadata).toEqual(expect.objectContaining({ encrypted: true }));
  });

  test('POST /didcomm rejects invalid content-type', async () => {
    const resp = await fetch(`http://localhost:${port}/didcomm?did=did:web:example.com:recipient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fake: 'data' }),
    });
    expect(resp.status).toBe(415);
    const json: any = await resp.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('INVALID_CONTENT_TYPE');
  });

  test('POST /didcomm missing recipient DID returns 400', async () => {
    const resp = await fetch(`http://localhost:${port}/didcomm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/didcomm-encrypted+json' },
      body: 'ignored',
    });
    expect(resp.status).toBe(400);
    const json: any = await resp.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('NO_RECIPIENT_DID');
  });
});
