import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from '../../src/api/middleware/validation';

function createRes() {
  return {
    statusCode: 0,
    payload: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { this.payload = data; },
  } as any;
}

function createReq(init: Partial<{ body: any; query: any; params: any; path: string; method: string }> = {}) {
  return {
    body: init.body || {},
    query: init.query || {},
    params: init.params || {},
    path: init.path || '/test',
    method: init.method || 'GET',
  } as any;
}

describe('validation middleware', () => {
  test('validateBody success passes to next', async () => {
    const schema = z.object({ a: z.string() });
    const req = createReq({ body: { a: 'ok' } });
    const res = createRes();
    const next = jest.fn();
    await validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0); // not set
  });

  test('validateBody failure returns 400 with details', async () => {
    const schema = z.object({ a: z.string() });
    const req = createReq({ body: { a: 123 } });
    const res = createRes();
    const next = jest.fn();
    await validateBody(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  });

  test('validateQuery success coercion works', async () => {
    const schema = z.object({ limit: z.coerce.number().min(1).default(10), search: z.string() });
    const req = createReq({ query: { limit: '5', search: 'abc' } });
    const res = createRes();
    const next = jest.fn();
    await validateQuery(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(typeof req.query.limit).toBe('number');
  });

  test('validateQuery failure returns 400', async () => {
    const schema = z.object({ limit: z.coerce.number().min(1), search: z.string() });
    const req = createReq({ query: { limit: '0', search: '' } });
    const res = createRes();
    const next = jest.fn();
    await validateQuery(schema)(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  });

  test('validateParams success assigns parsed values', async () => {
    const schema = z.object({ id: z.string().uuid() });
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const req = createReq({ params: { id: validUuid } });
    const res = createRes();
    const next = jest.fn();
    await validateParams(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.params.id).toBe(validUuid);
  });

  test('validateParams failure returns 400', async () => {
    const schema = z.object({ id: z.string().uuid() });
    const req = createReq({ params: { id: 'not-a-uuid' } });
    const res = createRes();
    const next = jest.fn();
    await validateParams(schema)(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  });
});
