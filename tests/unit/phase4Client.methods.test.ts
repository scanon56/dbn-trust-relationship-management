import { phase4Client } from '../../src/infrastructure/clients/phase4Client';
import { Phase4Error } from '../../src/utils/errors';

// Mock config to provide baseUrl
jest.mock('../../src/config', () => ({
  config: { phase4: { baseUrl: 'https://phase4.test', timeout: 5000 }, didcomm: { endpoint: 'https://didcomm.test' } },
}));

describe('Phase4Client methods', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  function mockFetchOnce(status: number, body: any) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'ERR',
      json: async () => body,
    }) as any;
  }

  test('encrypt success', async () => {
    mockFetchOnce(200, { success: true, data: { jwe: 'cipher', kid: 'kid1', alg: 'ECDH-ES' } });
    const res = await phase4Client.encrypt({ to: 'did:peer:abc', plaintext: 'hello' });
    expect(res.jwe).toBe('cipher');
  });

  test('encrypt failure returns Phase4Error', async () => {
    mockFetchOnce(500, { message: 'boom' });
    await expect(phase4Client.encrypt({ to: 'did:peer:abc', plaintext: 'hello' }))
      .rejects.toThrow(Phase4Error);
  });

  test('decrypt success', async () => {
    mockFetchOnce(200, { success: true, data: { plaintext: 'hello', kid: 'kid1' } });
    const res = await phase4Client.decrypt({ did: 'did:peer:abc', jwe: 'cipher' });
    expect(res.plaintext).toBe('hello');
  });

  test('decrypt failure', async () => {
    mockFetchOnce(404, { message: 'not found' });
    await expect(phase4Client.decrypt({ did: 'did:peer:abc', jwe: 'cipher' }))
      .rejects.toThrow(Phase4Error);
  });

  test('signJWS success', async () => {
    mockFetchOnce(200, { success: true, data: { token: 'header.payload.sig', keyId: 'key1', type: 'jwt' } });
    const res = await phase4Client.signJWS('did:peer:abc', { type: 'jwt', claims: { a: 1 } });
    expect(res.token).toContain('header');
  });

  test('signJWS failure', async () => {
    mockFetchOnce(400, { message: 'bad sign' });
    await expect(phase4Client.signJWS('did:peer:abc', { type: 'jwt', claims: { a: 1 } }))
      .rejects.toThrow(Phase4Error);
  });

  test('verifyJWS success', async () => {
    mockFetchOnce(200, { success: true, data: { verified: true, keyId: 'key1', type: 'jwt', header: {}, payload: { a: 1 } } });
    const res = await phase4Client.verifyJWS('did:peer:abc', { type: 'jwt', token: 'x.y.z' });
    expect(res.verified).toBe(true);
  });

  test('verifyJWS malformed token failure', async () => {
    mockFetchOnce(422, { message: 'malformed token' });
    await expect(phase4Client.verifyJWS('did:peer:abc', { type: 'jwt', token: 'malformed' }))
      .rejects.toThrow(Phase4Error);
  });
});
