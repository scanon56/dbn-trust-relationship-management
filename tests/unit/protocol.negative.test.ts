// Mock uuid before importing protocol modules to avoid ESM parsing issues in Jest environment
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { messageRepository } from '../../src/core/messages/MessageRepository';
import { connectionRepository } from '../../src/core/connections/ConnectionRepository';
import { TrustPingProtocol } from '../../src/core/protocols/TrustPingProtocol';
import { ConnectionProtocol } from '../../src/core/protocols/ConnectionProtocol';

jest.mock('../../src/core/messages/MessageRepository', () => ({
  messageRepository: { create: jest.fn(async () => ({})) }
}));

jest.mock('../../src/core/connections/ConnectionRepository', () => ({
  connectionRepository: {
    updateState: jest.fn(async () => ({})),
    findByDids: jest.fn(async () => null),
    create: jest.fn(async () => ({ id: 'conn1', state: 'requested' })),
    updateCapabilities: jest.fn(async () => ({})),
    findById: jest.fn(async () => ({ id: 'conn1', state: 'requested' })),
  }
}));

jest.mock('../../src/core/discovery/CapabilityDiscovery', () => ({
  capabilityDiscovery: { discoverCapabilities: jest.fn(async () => { throw new Error('discovery failed'); }) }
}));

describe('Protocol negative tests', () => {
  afterEach(() => jest.clearAllMocks());

  test('TrustPingProtocol handles unknown message type without throwing', async () => {
    const protocol = new TrustPingProtocol();
    await expect(protocol.handle({ id: 'x', type: 'https://didcomm.org/trust-ping/2.0/unknown', body: {}, to: [], from: 'did:a' }, { connectionId: undefined, direction: 'inbound', transport: 'http', encrypted: true })).resolves.toBeUndefined();
  });

  test('ConnectionProtocol capabilities discovery failure path', async () => {
    const protocol = new ConnectionProtocol();
    const msg = { id: 'm1', type: 'https://didcomm.org/connections/1.0/request', body: { label: 'Peer' }, to: ['did:me'], from: 'did:them' };
    await protocol.handle(msg as any, { connectionId: undefined, direction: 'inbound', transport: 'http', encrypted: true });
    // discovery failure triggers warn path but still creates connection
    expect(connectionRepository.create).toHaveBeenCalled();
  });

  test('ConnectionProtocol response with missing existing connection logs error branch', async () => {
    const protocol = new ConnectionProtocol();
    const msg = { id: 'm2', type: 'https://didcomm.org/connections/1.0/response', body: {}, to: ['did:me'], from: 'did:them' };
    await protocol.handle(msg as any, { connectionId: undefined, direction: 'inbound', transport: 'http', encrypted: true });
    // findByDids returns null leading to error branch (no updateState calls for responded/active)
    expect(connectionRepository.findByDids).toHaveBeenCalled();
    expect(connectionRepository.updateState).not.toHaveBeenCalledWith(expect.any(String), 'responded');
  });
});