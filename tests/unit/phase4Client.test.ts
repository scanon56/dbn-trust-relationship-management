import { Phase4Client } from '../../src/infrastructure/clients/phase4Client';

// Helper to mock fetch responses
function mockFetchOnce(status: number, json: any, delay = 0) {
  // @ts-ignore
  global.fetch = jest.fn(() => new Promise((resolve) => setTimeout(() => resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    json: async () => json,
  }), delay)));
}

describe('Phase4Client', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('encrypts message successfully', async () => {
    mockFetchOnce(200, { data: { jwe: 'ciphertext', kid: 'kid123' } });
    const client = new Phase4Client();
    const result = await client.encrypt({ to: 'did:ex:peer', plaintext: 'hello' });
    expect(result.jwe).toBe('ciphertext');
    expect(result.kid).toBe('kid123');
  });

  it('decrypts message successfully', async () => {
    mockFetchOnce(200, { data: { plaintext: 'hello', header: {}, kid: 'kid123' } });
    const client = new Phase4Client();
    const result = await client.decrypt({ did: 'did:ex:me', jwe: 'ciphertext' });
    expect(result.plaintext).toBe('hello');
  });

  it('handles API error response', async () => {
    mockFetchOnce(500, { error: 'boom' });
    const client = new Phase4Client();
    await expect(client.encrypt({ to: 'did:ex:peer', plaintext: 'hello' })).rejects.toThrow(/Failed to encrypt message/);
  });

  it('signs and verifies JWS', async () => {
    // sign
    mockFetchOnce(200, { data: { token: 'token123', keyId: 'key1', type: 'jws' } });
    const client = new Phase4Client();
    const signRes = await client.signJWS('did:ex:me', { type: 'jws', payload: { a: 1 } });
    expect(signRes.token).toBe('token123');
    // verify
    mockFetchOnce(200, { data: { verified: true, header: {}, claims: {}, payload: {}, keyId: 'key1' } });
    const verifyRes = await client.verifyJWS('did:ex:me', { token: 'token123', type: 'jws' });
    expect(verifyRes.verified).toBe(true);
  });

  it('handles timeout', async () => {
    const client = new Phase4Client();
    // shorten timeout directly on instance
    // @ts-ignore
    client.timeout = 15; // ms
    // Mock fetch that never resolves but rejects on abort
    // @ts-ignore
    global.fetch = jest.fn((url: string, options: any) => {
      return new Promise((_, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err: any = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });
    await expect(client.getDIDDocument('did:ex:timeout')).rejects.toThrow(/Aborted/);
  });
});
