// src/core/protocols/index.ts
export { ProtocolRegistry, protocolRegistry } from './ProtocolRegistry';
export { BasicMessageProtocol } from './BasicMessageProtocol';
export { TrustPingProtocol } from './TrustPingProtocol';
export { ConnectionProtocol } from './ConnectionProtocol';

// Initialize and register default protocols
import { protocolRegistry } from './ProtocolRegistry';
import { BasicMessageProtocol } from './BasicMessageProtocol';
import { TrustPingProtocol } from './TrustPingProtocol';
import { ConnectionProtocol } from './ConnectionProtocol';

export function initializeProtocols(): void {
  // Register built-in protocols
  protocolRegistry.register(new BasicMessageProtocol());
  protocolRegistry.register(new TrustPingProtocol());
  protocolRegistry.register(new ConnectionProtocol());
}