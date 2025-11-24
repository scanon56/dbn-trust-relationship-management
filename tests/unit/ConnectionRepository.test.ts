// tests/integration/ConnectionRepository.test.ts
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { clearDatabase } from '../helpers/database.helper';

describe('ConnectionRepository Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });


  describe('create', () => {
    it('should create a connection', async () => {
      const connection = await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:bob',
        theirLabel: 'Bob',
        state: 'invited',
        role: 'inviter',
      });

      expect(connection.id).toBeDefined();
      expect(connection.myDid).toBe('did:web:example.com:alice');
      expect(connection.theirDid).toBe('did:web:example.com:bob');
      expect(connection.state).toBe('invited');
    });

    it('should prevent duplicate connections', async () => {
      await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:bob',
        state: 'invited',
        role: 'inviter',
      });

      await expect(
        connectionRepository.create({
          myDid: 'did:web:example.com:alice',
          theirDid: 'did:web:example.com:bob',
          state: 'invited',
          role: 'inviter',
        })
      ).rejects.toThrow('Connection already exists');
    });
  });

  describe('findById', () => {
    it('should find connection by id', async () => {
      const created = await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:bob',
        state: 'invited',
        role: 'inviter',
      });

      const found = await connectionRepository.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await connectionRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('updateState', () => {
    it('should update connection state', async () => {
      const connection = await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:bob',
        state: 'invited',
        role: 'inviter',
      });

      const updated = await connectionRepository.updateState(connection.id, 'requested');
      expect(updated.state).toBe('requested');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:bob',
        state: 'complete',
        role: 'inviter',
      });

      await connectionRepository.create({
        myDid: 'did:web:example.com:alice',
        theirDid: 'did:web:example.com:charlie',
        state: 'invited',
        role: 'inviter',
      });
    });

    it('should list all connections', async () => {
      const result = await connectionRepository.list({});
      expect(result.connections).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by state', async () => {
      const result = await connectionRepository.list({ state: 'complete' });
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0].state).toBe('complete');
    });

    it('should paginate results', async () => {
      const result = await connectionRepository.list({ limit: 1, offset: 0 });
      expect(result.connections).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });
});