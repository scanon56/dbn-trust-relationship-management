import request from 'supertest';
jest.mock('uuid', () => { let c=0; return { v4: () => `uuid-test-${++c}` }; });
jest.mock('../../src/core/discovery/CapabilityDiscovery', () => ({
  capabilityDiscovery: {
    discoverCapabilities: jest.fn(async () => ({ endpoint: 'https://peer.endpoint/messages', protocols: ['https://didcomm.org/basicmessage/2.0'], services: [] })),
  },
}));
import app from '../../src/server';
import { clearDatabase } from '../helpers/database.helper';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';

describe('Connections Routes', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('creates invitation', async () => {
    const res = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:me', label: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.connection).toBeDefined();
    expect(res.body.data.invitation).toBeDefined();
    expect(res.body.data.invitationUrl).toMatch(/http/);
  });

  it('accepts invitation', async () => {
    const invite = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:me1' });
    const invitation = invite.body.data.invitation;
    const res = await request(app).post('/api/v1/connections/accept-invitation').send({ invitation, myDid: 'did:example:me2' });
    expect(res.status).toBe(201);
    expect(res.body.data.connection.state).toBeDefined();
  });

  it('lists connections', async () => {
    await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:listA' });
    await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:listB' });
    const res = await request(app).get('/api/v1/connections');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('gets connection by id', async () => {
    const created = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:getA' });
    const id = created.body.data.connection.id;
    const res = await request(app).get(`/api/v1/connections/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.connection.id).toBe(id);
  });

  it('updates metadata', async () => {
    const created = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:metaA' });
    const id = created.body.data.connection.id;
    const res = await request(app).patch(`/api/v1/connections/${id}`).send({ theirLabel: 'Peer', notes: 'Note' });
    expect(res.status).toBe(200);
    expect(res.body.data.connection.theirLabel).toBe('Peer');
  });

  it('refreshes capabilities on connection with known peer DID', async () => {
    // Insert connection directly with known theirDid
    const direct = await connectionRepository.create({
      myDid: 'did:example:me-cap',
      theirDid: 'did:example:peer-cap',
      state: 'active',
      role: 'inviter',
      theirEndpoint: 'https://peer.endpoint/messages',
    });
    const res = await request(app).post(`/api/v1/connections/${direct.id}/capabilities/refresh`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.connection.id).toBe(direct.id);
    expect(res.body.data.connection.theirProtocols.length).toBeGreaterThan(0);
  });

  it('gets capabilities', async () => {
    const created = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:capGetA' });
    const id = created.body.data.connection.id;
    const res = await request(app).get(`/api/v1/connections/${id}/capabilities`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('protocols');
  });

  it('pings connection (active required)', async () => {
    // Create and manually set active state for ping
    const created = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:pingA' });
    const id = created.body.data.connection.id;
    await connectionRepository.updateState(id, 'active');
    const res = await request(app).post(`/api/v1/connections/${id}/ping`).send();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deletes connection and subsequent get returns 400', async () => {
    const created = await request(app).post('/api/v1/connections/invitations').send({ myDid: 'did:example:delA' });
    const id = created.body.data.connection.id;
    const res = await request(app).delete(`/api/v1/connections/${id}`);
    expect(res.status).toBe(200);
    const getRes = await request(app).get(`/api/v1/connections/${id}`);
    expect(getRes.status).toBe(400);
  });
});
