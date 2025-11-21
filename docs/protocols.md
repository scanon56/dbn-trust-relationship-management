# DIDComm Protocols Documentation

## Overview

This document describes the DIDComm protocols implemented in the Trust Relationship Management service. All protocols follow the [DIDComm Messaging v2 specification](https://identity.foundation/didcomm-messaging/spec/).

## DIDComm Message Structure

All DIDComm messages share a common structure:
```json
{
  "id": "unique-message-id",
  "type": "https://didcomm.org/protocol-name/version/message-type",
  "from": "did:example:sender",
  "to": ["did:example:recipient"],
  "thid": "thread-id",
  "pthid": "parent-thread-id",
  "created_time": 1234567890,
  "expires_time": 1234567890,
  "body": {
    // Protocol-specific body
  },
  "attachments": []
}
```

### Key Fields

- **id**: Unique message identifier (UUID)
- **type**: Protocol message type URI
- **from**: Sender DID (optional for anonymous messages)
- **to**: Array of recipient DIDs
- **thid**: Thread ID for conversation tracking
- **pthid**: Parent thread ID for sub-conversations
- **body**: Protocol-specific message content
- **attachments**: Optional file attachments

## Implemented Protocols

### 1. Out-of-Band Invitation (2.0)

**Purpose:** Establish initial connection between peers without pre-existing relationship.

**Specification:** [DIDComm Out-of-Band](https://identity.foundation/didcomm-messaging/spec/#out-of-band-messages)

#### Invitation Message
```json
{
  "@type": "https://didcomm.org/out-of-band/2.0/invitation",
  "@id": "unique-invitation-id",
  "label": "Alice's Agent",
  "goal_code": "establish-connection",
  "goal": "To establish a secure connection",
  "accept": ["didcomm/v2"],
  "services": [
    {
      "id": "#didcomm",
      "type": "DIDCommMessaging",
      "serviceEndpoint": "https://alice.example.com/didcomm",
      "protocols": [
        "https://didcomm.org/connections/1.0",
        "https://didcomm.org/basicmessage/2.0"
      ]
    }
  ]
}
```

#### Invitation URL Format
```
https://didcomm.org/oob?_oob=<base64url-encoded-invitation>
```

**Example:**
```
https://didcomm.org/oob?_oob=eyJAdHlwZSI6Imh0dHBzOi8vZGlkY29tbS5vcmcvb3V0LW9mLWJhbmQvMi4wL2ludml0YXRpb24iLCJAaWQiOiIxMjM0NSIsImxhYmVsIjoiQWxpY2UncyBBZ2VudCJ9
```

#### Flow
```
Inviter (Alice)                    Invitee (Bob)
      |                                  |
      |-- 1. Create Invitation -------->|
      |   (Out-of-band: QR, link, etc)  |
      |                                  |
      |   (Connection Protocol begins)   |
      |<-- 2. Connection Request --------|
      |                                  |
      |-- 3. Connection Response ------->|
      |                                  |
      |<-- 4. ACK (optional) ------------|
      |                                  |
      [Connection Active]

Dual-DB Observation: With separate databases each agent stores a distinct connection record reflecting its role (inviter vs invitee). Progression of states is local to each DB; use the shared correlation ID (`dbn:cid`) embedded in the invitation to trace the end-to-end handshake across both instances.
```

### 2. Connection Protocol (1.0)

**Purpose:** Establish bidirectional connection after out-of-band invitation.

**Specification:** [RFC 0160](https://github.com/hyperledger/aries-rfcs/blob/main/features/0160-connection-protocol/README.md)

#### States

- **invited** - Invitation created by inviter
- **requested** - Request sent by invitee
- **responded** - Response sent by inviter
- **active** - Connection fully established
- **completed** - Connection archived

Dual-DB State Mapping:
```
Agent A (inviter DB): invited → requested → (response sent) → active
Agent B (invitee DB): requested → responded → active
```
In a single shared database implementation you would typically maintain one row and update it through the unified sequence; for realism and isolation we use two DBs in local multi-instance testing.

#### 2.1 Connection Request

Sent by invitee to inviter after receiving invitation.
```json
{
  "id": "request-message-id",
  "type": "https://didcomm.org/connections/1.0/request",
  "from": "did:example:bob",
  "to": ["did:example:alice"],
  "thid": "invitation-id",
  "body": {
    "label": "Bob's Agent",
    "goal_code": "establish-connection",
    "goal": "Connect for business collaboration"
  }
}

Endpoint Integrity: The DID Document or service block included must advertise the invitee's DIDComm endpoint (e.g. port 3002 for Agent B). If it mistakenly advertises the inviter's endpoint, the response loops back and the invitee never progresses beyond `requested`.
```

**Handler Action:**
1. Validate request
2. Create/update connection record (state: `requested`)
3. Discover sender's capabilities
4. Optionally auto-respond with connection response

#### 2.2 Connection Response

Sent by inviter to invitee in response to request.
```json
{
  "id": "response-message-id",
  "type": "https://didcomm.org/connections/1.0/response",
  "from": "did:example:alice",
  "to": ["did:example:bob"],
  "thid": "invitation-id",
  "body": {
    "goal_code": "connection-established",
    "goal": "Connection accepted"
  }
}

Fast Activation: Current implementation transitions the invitee directly to `active` after processing the response; an optional ACK remains for compatibility with other ecosystems.
```

**Handler Action:**
1. Validate response
2. Update connection state to `responded`
3. Discover responder's capabilities
4. Transition to `active` state
5. Optionally send ACK

#### 2.3 Connection ACK (Optional)

Optional acknowledgment of connection response.
```json
{
  "id": "ack-message-id",
  "type": "https://didcomm.org/connections/1.0/ack",
  "from": "did:example:bob",
  "to": ["did:example:alice"],
  "thid": "invitation-id",
  "body": {
    "status": "OK"
  }
}
```

**Handler Action:**
1. Confirm connection is `active`
2. Log acknowledgment

### 3. Basic Message Protocol (2.0)

**Purpose:** Simple text messaging between connected peers.

**Specification:** [Basic Message 2.0](https://didcomm.org/basicmessage/2.0/)

#### Message Format
```json
{
  "id": "message-id",
  "type": "https://didcomm.org/basicmessage/2.0/message",
  "from": "did:example:alice",
  "to": ["did:example:bob"],
  "thid": "conversation-thread-id",
  "created_time": 1234567890,
  "body": {
    "content": "Hello Bob! How are you?"
  }
}
```

#### Fields

- **content** (required): Message text content
- **sent_time** (optional): When message was sent
- **locale** (optional): Language/locale code (e.g., "en-US")

#### Handler Action

1. Validate message structure
2. Store message in database
3. Mark as `processed`
4. Optionally trigger notification/webhook

#### Threading

Messages can be threaded using `thid` field:
```json
{
  "id": "reply-id",
  "type": "https://didcomm.org/basicmessage/2.0/message",
  "from": "did:example:bob",
  "to": ["did:example:alice"],
  "thid": "original-message-id",
  "body": {
    "content": "I'm doing great, thanks!"
  }
}
```

#### Use Cases

- Simple text chat
- Status updates
- Notifications
- System messages

Activation Guard: Basic messages are only permitted once the connection state is `active`. Handshake messages (request/response/ack) are allowed in their transitional states.

### 4. Trust Ping Protocol (2.0)

**Purpose:** Verify connection liveness and measure response time.

**Specification:** [Trust Ping 2.0](https://didcomm.org/trust-ping/2.0/)

#### 4.1 Ping Message
```json
{
  "id": "ping-id",
  "type": "https://didcomm.org/trust-ping/2.0/ping",
  "from": "did:example:alice",
  "to": ["did:example:bob"],
  "body": {
    "response_requested": true,
    "comment": "Checking connection health"
  }
}
```

**Fields:**
- **response_requested** (default: true): Whether response is expected
- **comment** (optional): Human-readable comment

**Handler Action:**
1. Store ping message
2. Update connection `last_active_at`
3. If `response_requested`, send ping-response

#### 4.2 Ping Response
```json
{
  "id": "pong-id",
  "type": "https://didcomm.org/trust-ping/2.0/ping-response",
  "from": "did:example:bob",
  "to": ["did:example:alice"],
  "thid": "ping-id",
  "body": {
    "comment": "Pong"
  }
}
```

**Handler Action:**
1. Store response
2. Update connection to `active`
3. Calculate round-trip time
4. Emit success event

#### Use Cases

- Connection health monitoring
- Latency measurement
- Keepalive for long-lived connections
- Verify endpoint reachability

#### Example Flow
```
Alice                              Bob
  |                                 |
  |-- Ping (response_requested) -->|
  |   (timestamp: T1)               |
  |                                 |
  |<-- Ping Response ---------------|
  |   (timestamp: T2)               |
  |                                 |
  RTT = T2 - T1

  Dual-DB Note: Trust ping is only meaningful after both agents independently reach `active`. Each database updates its own connection's `last_active_at` when processing ping/pong.
```

## Protocol Extension Guidelines

### Creating Custom Protocols

To add a new protocol handler:

1. **Define Protocol Handler**
```typescript
import { ProtocolHandler, MessageContext } from '../types/protocol.types';
import { DIDCommMessage } from '../types/didcomm.types';

export class CustomProtocol implements ProtocolHandler {
  readonly type = 'https://example.com/custom-protocol/1.0';
  readonly name = 'Custom Protocol';
  readonly version = '1.0';

  supports(messageType: string): boolean {
    return messageType.startsWith('https://example.com/custom-protocol/1.0');
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise {
    // Protocol-specific logic
    console.log('Handling custom message:', message);
    
    // Store message
    // Process business logic
    // Send response if needed
  }
}
```

2. **Register Handler**
```typescript
import { protocolRegistry } from '../core/protocols';
import { CustomProtocol } from './CustomProtocol';

protocolRegistry.register(new CustomProtocol());
```

3. **Define Message Types**
```typescript
// Message type constants
export const CUSTOM_PROTOCOL = {
  REQUEST: 'https://example.com/custom-protocol/1.0/request',
  RESPONSE: 'https://example.com/custom-protocol/1.0/response',
  NOTIFICATION: 'https://example.com/custom-protocol/1.0/notification',
};
```

### Best Practices

1. **Message Type URIs:**
   - Use HTTPS URLs
   - Include version number
   - Follow pattern: `https://domain/protocol-name/version/message-type`

2. **State Management:**
   - Store protocol state in database
   - Use message threading (`thid`) for conversations
   - Handle idempotency (duplicate message IDs)

3. **Error Handling:**
   - Use problem reports for errors
   - Include descriptive error codes
   - Log all errors with context

4. **Testing:**
   - Unit test handler logic
   - Integration test message flows
   - Test error scenarios

5. **Documentation:**
   - Document message formats
   - Provide example flows
   - Specify required/optional fields

## Message Encryption

All DIDComm messages are encrypted using JWE (JSON Web Encryption).

### Encryption Types

**Anonymous Encryption (anoncrypt):**
- Algorithm: ECDH-ES
- Sender is not authenticated
- Only recipient can decrypt

**Authenticated Encryption (authcrypt):**
- Algorithm: ECDH-1PU
- Sender is authenticated
- Both parties' keys involved
- Preferred for most use cases

### Encrypted Message Format
```
{Encrypted JWE String}
```

The plaintext message is encrypted and the result is a compact JWE string sent to the peer.

## Error Handling

### Problem Reports

When a protocol error occurs, send a problem report:
```json
{
  "id": "error-id",
  "type": "https://didcomm.org/notification/1.0/problem-report",
  "from": "did:example:alice",
  "to": ["did:example:bob"],
  "thid": "failed-message-id",
  "body": {
    "code": "request_not_accepted",
    "comment": "Connection request validation failed",
    "args": {
      "reason": "Invalid DID format"
    }
  }
}
```

### Error Codes

- `message_not_accepted` - Message rejected
- `request_not_accepted` - Request rejected
- `request_processing_error` - Error during processing
- `response_not_accepted` - Response rejected
- `message_delivery_error` - Delivery failed

## Message Threading

### Thread Management

Messages can be organized into threads using `thid` (thread ID):
```json
// Initial message
{
  "id": "msg-1",
  "type": "...",
  "body": { ... }
}

// Reply (same thread)
{
  "id": "msg-2",
  "type": "...",
  "thid": "msg-1",  // Links to original
  "body": { ... }
}

// Another reply
{
  "id": "msg-3",
  "type": "...",
  "thid": "msg-1",  // Same thread
  "body": { ... }
}
```

### Parent Threads

For nested conversations, use `pthid` (parent thread ID):
```json
{
  "id": "sub-conversation-1",
  "type": "...",
  "thid": "msg-2",   // Current thread
  "pthid": "msg-1",  // Parent thread
  "body": { ... }
}
```

## Message Timing

### Timestamps

- **created_time**: When message was created (Unix timestamp)
- **expires_time**: When message expires (Unix timestamp)
```json
{
  "id": "msg-1",
  "type": "...",
  "created_time": 1699564800,
  "expires_time": 1699651200,
  "body": { ... }
}
```

### TTL (Time to Live)

Set expiration for time-sensitive messages:
```javascript
const expiresIn24Hours = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
```

## Attachments

### Attachment Format
```json
{
  "id": "msg-with-attachment",
  "type": "...",
  "body": { ... },
  "attachments": [
    {
      "@id": "attachment-1",
      "mime-type": "application/pdf",
      "filename": "invoice.pdf",
      "data": {
        "base64": "JVBERi0xLjQKJ..."
      }
    }
  ]
}
```

### Attachment Types

- **Embedded**: Base64-encoded data in message
- **Link**: URL to external resource
- **JWS**: Signed attachments

## Future Protocols

### Phase 3 (Protocol Registry)
- Protocol advertisement
- Capability negotiation
- Dynamic protocol discovery

### Phase 5 (Credentials)
- Issue Credential Protocol
- Present Proof Protocol
- Revocation Notification

### Phase 4 (Business Processes)
- BPMN-based business protocols
- Multi-party workflows
- Document exchange protocols

## References

- [DIDComm Messaging v2](https://identity.foundation/didcomm-messaging/spec/)
- [Aries RFC 0160: Connection Protocol](https://github.com/hyperledger/aries-rfcs/blob/main/features/0160-connection-protocol/README.md)
- [DIDComm Basic Message](https://didcomm.org/basicmessage/2.0/)
- [DIDComm Trust Ping](https://didcomm.org/trust-ping/2.0/)
- [W3C DID Core](https://www.w3.org/TR/did-core/)