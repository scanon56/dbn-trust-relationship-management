import request from 'supertest';
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }));
import app from '../../src/server';
import { pool } from '../../src/infrastructure/database/pool';

describe('Health Route', () => {
  it('returns healthy status structure', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'healthy', checks: { database: 'healthy' } });
  });

  it('returns degraded when database query fails', async () => {
    const spy = jest.spyOn(pool, 'query').mockImplementationOnce(() => Promise.reject(new Error('DB down')) as any);
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toBe('unhealthy');
    spy.mockRestore();
  });
});
