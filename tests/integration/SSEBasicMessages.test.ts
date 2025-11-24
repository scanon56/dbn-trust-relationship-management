import http from 'http';
// Mock uuid to avoid ESM parsing issues and ensure deterministic IDs
jest.mock('uuid', () => ({ v4: () => 'uuid-sse-test' }));
import app from '../../src/server';
import { eventBus, Events } from '../../src/core/events/EventBus';

describe('SSE BasicMessages Stream', () => {
  let server: http.Server;
  let port: number;

  beforeAll(done => {
    server = app.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      done();
    });
  });

  afterAll(done => {
    server.close(done);
  });

  test('emits BASIC_MESSAGE_RECEIVED events over SSE', async () => {
    const received = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for SSE event')), 8000);
      const req = http.get(`http://localhost:${port}/api/v1/events/basicmessages`, res => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buffer += chunk;
          if (buffer.includes('event: basicmessage') && buffer.includes('data:')) {
            // Extract the last basicmessage block
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
      // Emit after short delay to ensure listener attached
      setTimeout(() => {
        const testPayload = {
          messageId: 'test-msg-' + Date.now(),
          connectionId: 'conn-123',
          fromDid: 'did:web:example.com:alice',
          content: 'Hello SSE',
          lang: 'en',
          createdTime: Math.floor(Date.now() / 1000),
          encrypted: true,
          attachmentsCount: 0,
        };
        eventBus.emit(Events.BASIC_MESSAGE_RECEIVED, testPayload);
      }, 150);
    });

    const payload = await received;
    expect(payload).toMatchObject({
      content: 'Hello SSE',
      connectionId: 'conn-123',
    });
    expect(typeof payload.messageId).toBe('string');
  });
});
