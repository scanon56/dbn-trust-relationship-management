import { errorHandler } from '../../src/api/middleware/errorHandler';
import { TrustManagementError } from '../../src/utils/errors';

function createRes() {
  return {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; },
  } as any;
}

describe('errorHandler middleware', () => {
  it('handles known TrustManagementError', () => {
    // Constructor: (message, code, details?, statusCode?)
    const err = new TrustManagementError('known', 'KNOWN_CODE', {}, 418);
    const req: any = { path: '/test', method: 'GET' };
    const res = createRes();
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.statusCode).toBe(418);
    expect(res.body.error.code).toBe('KNOWN_CODE');
  });

  it('handles unknown generic Error', () => {
    const err = new Error('boom');
    const req: any = { path: '/test2', method: 'POST' };
    const res = createRes();
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
