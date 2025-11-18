// tests/unit/ProtocolRegistry.test.ts
import { ProtocolRegistry } from '../../src/core/protocols/ProtocolRegistry';
import { ProtocolHandler } from '../../src/types/protocol.types';
import { DIDCommMessage } from '../../src/types/didcomm.types';

class MockProtocolHandler implements ProtocolHandler {
  readonly type = 'https://example.com/test/1.0';
  readonly name = 'Test Protocol';
  readonly version = '1.0';

  supports(messageType: string): boolean {
    return messageType.startsWith(this.type);
  }

  async handle(message: DIDCommMessage): Promise<void> {
    // Mock implementation
  }
}

describe('ProtocolRegistry', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    registry = new ProtocolRegistry();
  });

  describe('register', () => {
    it('should register a protocol handler', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);

      const retrieved = registry.getHandler('https://example.com/test/1.0');
      expect(retrieved).toBe(handler);
    });

    it('should overwrite existing handler with same type', () => {
      const handler1 = new MockProtocolHandler();
      const handler2 = new MockProtocolHandler();

      registry.register(handler1);
      registry.register(handler2);

      const retrieved = registry.getHandler('https://example.com/test/1.0');
      expect(retrieved).toBe(handler2);
    });
  });

  describe('getHandler', () => {
    it('should return handler for exact match', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);

      const retrieved = registry.getHandler('https://example.com/test/1.0');
      expect(retrieved).toBe(handler);
    });

    it('should return handler for partial match', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);

      const retrieved = registry.getHandler('https://example.com/test/1.0/message');
      expect(retrieved).toBe(handler);
    });

    it('should return null for unknown type', () => {
      const retrieved = registry.getHandler('https://example.com/unknown/1.0');
      expect(retrieved).toBeNull();
    });
  });

  describe('unregister', () => {
    it('should remove handler', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);
      registry.unregister('https://example.com/test/1.0');

      const retrieved = registry.getHandler('https://example.com/test/1.0');
      expect(retrieved).toBeNull();
    });
  });

  describe('listProtocols', () => {
    it('should return list of registered protocols', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);

      const protocols = registry.listProtocols();
      expect(protocols).toHaveLength(1);
      expect(protocols[0]).toEqual({
        type: 'https://example.com/test/1.0',
        name: 'Test Protocol',
        version: '1.0',
      });
    });
  });

  describe('supports', () => {
    it('should return true for supported type', () => {
      const handler = new MockProtocolHandler();
      registry.register(handler);

      expect(registry.supports('https://example.com/test/1.0')).toBe(true);
    });

    it('should return false for unsupported type', () => {
      expect(registry.supports('https://example.com/unknown/1.0')).toBe(false);
    });
  });
});