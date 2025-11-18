# DBN Trust Relationship Management - Architecture

## Overview

The DBN Trust Relationship Management service (Phase 2) is a core component of the Decentralized Business Network Platform. It implements DIDComm-based peer-to-peer connections and message exchange, enabling trust establishment between network participants.

## System Context
```
┌─────────────────────────────────────────────────────────────┐
│                   External Systems                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │   Peer DIDs  │◄────────┤  DIDComm     │                │
│  │   (Remote)   │         │  Messages    │                │
│  └──────────────┘         └──────────────┘                │
│                                  │                          │
└──────────────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
         ┌─────────────────────────────────────────┐
         │   Phase 2: Trust Relationship Mgmt      │
         │   (This Service - Port 3001)            │
         └─────────────────┬───────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────────┐
         │   Phase 4: DID Service API              │
         │   (Port 3000)                           │
         │   - DID Resolution                      │
         │   - Encryption/Decryption               │
         │   - Signing/Verification                │
         └─────────────────────────────────────────┘
```

## High-Level Architecture
```
┌────────────────────────────────────────────────────────────┐
│                      API Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ REST API     │  │ Validation   │  │ Error Handler   │  │
│  │ (Express)    │  │ (Zod)        │  │                 │  │
│  └──────┬───────┘  └──────────────┘  └─────────────────┘  │
└─────────┼──────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Connection   │  │ Message      │  │ Protocol        │  │
│  │ Manager      │  │ Router       │  │ Registry        │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                    │           │
│         └─────────────────┴────────────────────┘           │
│                           │                                │
│  ┌────────────────────────┴─────────────────────────────┐  │
│  │            Protocol Handlers                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │BasicMsg  │  │TrustPing │  │ Connection Proto │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────┬──────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────┐
│                   Data Access Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Connection   │  │ Message      │  │ Capability      │  │
│  │ Repository   │  │ Repository   │  │ Discovery       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
└─────────┼──────────────────┼───────────────────┼───────────┘
          │                  │                   │
          └──────────────────┴───────────────────┘
                             │
                             ▼
          ┌─────────────────────────────────────┐
          │      PostgreSQL Database            │
          │  - connections                      │
          │  - messages                         │
          │  - protocol_capabilities            │
          └─────────────────────────────────────┘
```

## Core Components

### 1. Connection Manager

**Responsibility:** Manages the lifecycle of peer-to-peer connections.

**Key Functions:**
- Create out-of-band invitations
- Accept invitations from peers
- Manage connection state transitions
- Discover and cache peer capabilities
- Update connection metadata

**State Machine:**
```
invited → requested → responded → active → completed
           ↓           ↓          ↓
         error       error      error
```

**Dependencies:**
- Connection Repository (data persistence)
- Capability Discovery (peer DID resolution)
- Phase 4 API Client (DID operations)

### 2. Message Router

**Responsibility:** Route incoming DIDComm messages to appropriate protocol handlers.

**Flow:**
```
Incoming Message
    ↓
Decrypt (via Phase 4 API)
    ↓
Extract message type
    ↓
Lookup Protocol Handler
    ↓
Dispatch to Handler
    ↓
Store Message
```

**Key Functions:**
- Message type identification
- Handler lookup and dispatch
- Error handling and retry logic
- Message state management

### 3. Protocol Registry

**Responsibility:** Maintain registry of protocol handlers and route messages.

**Registered Protocols:**
- **BasicMessage (2.0):** Simple text messaging
- **TrustPing (2.0):** Connection health checks
- **Connection (1.0):** Connection establishment

**Extension Pattern:**
```typescript
class CustomProtocol implements ProtocolHandler {
  readonly type = 'https://example.com/protocol/1.0';
  readonly name = 'Custom Protocol';
  readonly version = '1.0';
  
  supports(messageType: string): boolean { ... }
  async handle(message: DIDCommMessage, context: MessageContext): Promise { ... }
}

protocolRegistry.register(new CustomProtocol());
```

### 4. Capability Discovery

**Responsibility:** Discover and cache protocol capabilities from peer DID Documents.

**Discovery Process:**
1. Resolve peer DID via Phase 4 API
2. Extract DID Document
3. Parse service endpoints
4. Identify supported protocols
5. Cache capabilities locally

**Cached Data:**
- Primary DIDComm endpoint
- Supported protocol list
- Service endpoints
- Last discovery timestamp

### 5. Transport Layer

**Current Implementation:** HTTP/HTTPS
**Future:** WebSocket, Bluetooth, NFC

**Inbound Flow:**
```
POST /didcomm
    ↓
Receive encrypted JWE
    ↓
Decrypt via Phase 4 API
    ↓
Route to Protocol Handler
    ↓
Return 202 Accepted
```

**Outbound Flow (TODO - Step 10):**
```
Application calls sendMessage()
    ↓
Look up connection endpoint
    ↓
Encrypt via Phase 4 API
    ↓
HTTP POST to peer endpoint
    ↓
Handle response/errors
```

## Data Model

### Connections Table
```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  my_did TEXT NOT NULL,
  their_did TEXT NOT NULL,
  their_label TEXT,
  state TEXT NOT NULL,  -- invited, requested, responded, active, completed, error
  role TEXT NOT NULL,   -- inviter, invitee
  their_endpoint TEXT,
  their_protocols JSONB,
  their_services JSONB,
  invitation JSONB,
  invitation_url TEXT,
  tags TEXT[],
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  UNIQUE(my_did, their_did)
);
```

**Indexes:**
- `my_did` - Fast lookup by local DID
- `their_did` - Fast lookup by peer DID
- `state` - Filter by connection state
- `their_protocols` (GIN) - Protocol capability queries
- `tags` (GIN) - Tag-based filtering

### Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  thread_id TEXT,
  parent_id UUID REFERENCES messages(id),
  connection_id UUID REFERENCES connections(id),
  type TEXT NOT NULL,
  direction TEXT NOT NULL,  -- inbound, outbound
  from_did TEXT NOT NULL,
  to_dids TEXT[],
  body JSONB NOT NULL,
  attachments JSONB,
  state TEXT NOT NULL,  -- pending, sent, delivered, failed, processed
  error_message TEXT,
  retry_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  tsv tsvector  -- Full-text search
);
```

**Indexes:**
- `message_id` - DIDComm message ID lookup
- `thread_id` - Thread-based queries
- `connection_id` - Messages per connection
- `type` - Protocol-based filtering
- `state` - Processing status queries
- `tsv` (GIN) - Full-text search

### Protocol Capabilities Table
```sql
CREATE TABLE protocol_capabilities (
  did TEXT,
  protocol_id TEXT,
  enabled BOOLEAN,
  discovered_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  metadata JSONB,
  PRIMARY KEY (did, protocol_id)
);
```

## Integration Points

### Phase 4 API (DID Service)

**Base URL:** `http://localhost:3000`

**Used Endpoints:**

1. **Get DID Document**
   - `GET /api/v1/dids/{did}/document`
   - Purpose: Discover peer capabilities
   - Frequency: On connection establishment, on refresh

2. **Resolve DID**
   - `POST /api/v1/dids/{did}/resolve`
   - Purpose: Full DID resolution with metadata
   - Frequency: As needed for remote DIDs

3. **Encrypt Message**
   - `POST /api/v1/didcomm/encrypt`
   - Purpose: Encrypt outbound DIDComm messages
   - Frequency: Every outbound message

4. **Decrypt Message**
   - `POST /api/v1/didcomm/decrypt`
   - Purpose: Decrypt inbound DIDComm messages
   - Frequency: Every inbound message

5. **Sign JWS (Optional)**
   - `POST /api/v1/dids/{did}/sign/jws`
   - Purpose: Sign messages requiring authentication
   - Frequency: As needed per protocol

6. **Verify JWS (Optional)**
   - `POST /api/v1/dids/{did}/verify/jws`
   - Purpose: Verify signed messages
   - Frequency: As needed per protocol

### External Peers

**Inbound:** Peers send encrypted DIDComm messages to:
- `POST http://localhost:3001/didcomm`
- Content-Type: `application/didcomm-encrypted+json`

**Outbound:** Service sends encrypted messages to peer endpoints discovered from their DID Documents.

## Security Considerations

### Authentication
- All DIDComm messages are encrypted end-to-end
- Messages can be authenticated using sender DID
- Connection invitations use cryptographically secure random IDs

### Authorization
- Only active connections can exchange messages
- State machine prevents invalid state transitions
- Connection metadata is isolated per connection

### Data Protection
- Message bodies stored encrypted at rest (TODO)
- Sensitive metadata protected via database permissions
- Audit logging for all state changes

### Threat Model
- **Replay Attacks:** Mitigated by message IDs and timestamps
- **Man-in-the-Middle:** Prevented by DIDComm encryption
- **Denial of Service:** Rate limiting on transport layer (TODO)
- **Message Tampering:** Detected via cryptographic signatures

## Scalability Considerations

### Current Limits
- Single server instance
- PostgreSQL connection pooling (max 20 connections)
- Synchronous message processing

### Future Scaling
- **Horizontal Scaling:** Add load balancer, multiple instances
- **Async Processing:** Message queue (Redis/RabbitMQ)
- **Caching:** Redis for capability cache
- **Database:** Read replicas for queries
- **WebSocket:** For real-time bidirectional messaging

## Monitoring & Observability

### Logging
- **Framework:** Winston
- **Levels:** error, warn, info, debug
- **Format:** JSON (structured logging)
- **Key Events:**
  - Connection lifecycle changes
  - Message routing and processing
  - Protocol handler invocations
  - Phase 4 API calls
  - Errors and exceptions

### Metrics (TODO)
- Connection count (by state)
- Message throughput (inbound/outbound)
- Protocol handler latency
- Phase 4 API latency
- Error rates

### Health Checks
- `GET /health` - Service health
- Database connectivity
- Phase 4 API connectivity

## Configuration

### Environment Variables
```bash
# Server
NODE_ENV=development|production
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dbn_trust_management
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=20

# Phase 4 API
PHASE4_API_URL=http://localhost:3000
PHASE4_TIMEOUT=30000

# DIDComm
DIDCOMM_ENDPOINT=http://localhost:3001/didcomm
DEFAULT_DID=did:web:localhost:alice

# Logging
LOG_LEVEL=info|debug|warn|error
LOG_FORMAT=json|simple
```

## Development Workflow

### Setup
```bash
npm install
cp .env.example .env
# Edit .env with your configuration
npm run migrate
```

### Development
```bash
npm run dev  # Start with hot reload
```

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Database Migrations
```bash
npm run migrate  # Run pending migrations
```

### Building
```bash
npm run build    # TypeScript compilation
npm start        # Start production build
```

## Deployment

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Phase 4 API running and accessible

### Steps
1. Clone repository
2. Install dependencies: `npm install`
3. Configure environment: `.env`
4. Run migrations: `npm run migrate`
5. Build: `npm run build`
6. Start: `npm start`

### Docker (Future)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/server.js"]
```

## Future Enhancements

### Phase 3 Integration
- Global protocol registry integration
- Advanced capability matching
- Trust registry verification

### Phase 4 Integration
- BPMN process orchestration
- Business protocol execution
- Choreography management

### Phase 5 Integration
- OpenID4VC credential exchange
- Credential issuance workflows
- Presentation protocols

### Features
- WebSocket transport
- Message queuing and retry
- Webhook notifications
- Connection groups/networks
- Advanced search and filtering
- Message threading UI
- Audit trail export