# DBN Trust Relationship Management

Phase 2 of the Decentralized Business Network Platform - DIDComm-based peer-to-peer connection and message management.

## Overview

The Trust Relationship Management service provides:
- **DIDComm Connection Protocol** - Establish secure peer-to-peer connections
- **Message Exchange** - Send and receive encrypted DIDComm messages
- **Protocol Handling** - Extensible protocol handler system
- **Capability Discovery** - Discover peer capabilities from DID Documents

## Features

- ✅ Out-of-band invitation creation and acceptance
- ✅ Connection lifecycle management (invited → requested → responded → active)
- ✅ DIDComm v2 message encryption/decryption
- ✅ Protocol handlers: BasicMessage, TrustPing, Connection
- ✅ Capability discovery from peer DID Documents
- ✅ Message threading and search
- ✅ Connection metadata and tagging
- ✅ Failed message retry

## Architecture
```
┌─────────────────────────────────────────────────────┐
│              Trust Relationship Management          │
│                    (Port 3001)                      │
│                                                     │
│  ┌──────────────┐        ┌──────────────┐          │
│  │  Connection  │        │   Message    │          │
│  │  Manager     │        │   Router     │          │
│  └──────┬───────┘        └──────┬───────┘          │
│         │                       │                  │
│         └───────────┬───────────┘                  │
│                     │                              │
│         ┌───────────▼───────────┐                  │
│         │  Protocol Registry    │                  │
│         │  - BasicMessage       │                  │
│         │  - TrustPing          │                  │
│         │  - Connection         │                  │
│         └───────────────────────┘                  │
│                                                     │
│         ┌───────────────────────┐                  │
│         │   PostgreSQL          │                  │
│         └───────────────────────┘                  │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │  Phase 4 DID API   │
        │  (Port 3000)       │
        └────────────────────┘
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Phase 4 DID Service running on port 3000

## Installation
```bash
# Clone repository
git clone <repository-url>
cd dbn-trust-relationship-management

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run database migrations
npm run migrate
```

### Using Docker Compose (Optional)
```bash
# Start Postgres + pgAdmin
docker compose up -d postgres pgadmin

# Copy environment template and select Docker credentials
cp .env.example .env
# Edit .env: uncomment dbn_user/dbn_password/dbn_platform block
sed -n '1,120p' .env

# Run migrations
npm run migrate
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Database Management
```bash
# Run migrations
npm run migrate

# Reset database (drop all data)
psql -U postgres -d dbn_trust_management -c "TRUNCATE TABLE messages, connections, protocol_capabilities CASCADE"
```

#### Helper Scripts
```bash
# Open interactive psql using env vars
./scripts/db-shell.sh

# Reset schema (DESTROYS DATA) then run migrations
./scripts/db-reset.sh
```

#### Credential Sets
| Scenario | DB_NAME | DB_USER | DB_PASSWORD |
|----------|---------|---------|-------------|
| Default local | dbn_trust_management | postgres | postgres |
| Docker compose | dbn_platform | dbn_user | dbn_password |

Switch by editing `.env` (see `.env.example`).

## API Documentation

Full API documentation is available via the OpenAPI specification at `/api/v1/docs` (when Swagger UI is integrated).

### Key Endpoints

**Connections:**
- `POST /api/v1/connections/invitations` - Create invitation
- `POST /api/v1/connections/accept-invitation` - Accept invitation
- `GET /api/v1/connections` - List connections
- `GET /api/v1/connections/:id` - Get connection
- `PATCH /api/v1/connections/:id` - Update metadata
- `DELETE /api/v1/connections/:id` - Delete connection
- `POST /api/v1/connections/:id/ping` - Send trust ping

**Messages:**
- `POST /api/v1/messages` - Send message
- `GET /api/v1/messages` - List messages
- `GET /api/v1/messages/search` - Search messages
- `GET /api/v1/messages/:id` - Get message
- `GET /api/v1/messages/thread/:threadId` - Get thread
- `POST /api/v1/messages/:id/retry` - Retry failed message

**DIDComm Transport:**
- `POST /didcomm?did={recipientDid}` - Receive encrypted DIDComm message

## Example Flows

### 1. Establish Connection

**Alice creates invitation:**
```bash
curl -X POST http://localhost:3001/api/v1/connections/invitations \
  -H "Content-Type: application/json" \
  -d '{
    "myDid": "did:web:example.com:alice",
    "label": "Alice Agent",
    "goal": "Establish business connection"
  }'
```

**Bob accepts invitation:**
```bash
curl -X POST http://localhost:3001/api/v1/connections/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "invitation": "<invitation-url>",
    "myDid": "did:web:example.com:bob",
    "label": "Bob Agent"
  }'
```

### 2. Send Message
```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "<connection-id>",
    "type": "https://didcomm.org/basicmessage/2.0/message",
    "body": {
      "content": "Hello Bob!"
    }
  }'
```

### 3. Trust Ping
```bash
curl -X POST http://localhost:3001/api/v1/connections/{connection-id}/ping
```

## Project Structure
```
dbn-trust-relationship-management/
├── src/
│   ├── api/
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/           # API routes
│   │   └── schemas/          # Zod validation schemas
│   ├── core/
│   │   ├── connections/      # Connection management
│   │   ├── messages/         # Message handling
│   │   ├── protocols/        # Protocol handlers
│   │   └── discovery/        # Capability discovery
│   ├── infrastructure/
│   │   ├── clients/          # Phase 4 API client
│   │   ├── database/         # Database migrations & pool
│   │   └── transport/        # HTTP transport
│   ├── types/               # TypeScript types
│   ├── utils/               # Utilities (logger, errors)
│   ├── config/              # Configuration
│   └── server.ts            # Express server
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── helpers/            # Test helpers
├── docs/
│   ├── architecture.md     # Architecture documentation
│   └── protocols.md        # Protocol specifications
└── package.json
```

## Development

### Adding a New Protocol Handler

1. Create handler class implementing `ProtocolHandler`:
```typescript
// src/core/protocols/CustomProtocol.ts
export class CustomProtocol implements ProtocolHandler {
  readonly type = 'https://example.com/custom/1.0';
  readonly name = 'Custom Protocol';
  readonly version = '1.0';

  supports(messageType: string): boolean {
    return messageType.startsWith(this.type);
  }

  async handle(message: DIDCommMessage, context: MessageContext): Promise<void> {
    // Implementation
  }
}
```

2. Register in protocol initialization:
```typescript
// src/core/protocols/index.ts
import { CustomProtocol } from './CustomProtocol';

export function initializeProtocols(): void {
  protocolRegistry.register(new BasicMessageProtocol());
  protocolRegistry.register(new TrustPingProtocol());
  protocolRegistry.register(new ConnectionProtocol());
  protocolRegistry.register(new CustomProtocol()); // Add here
}
```

## Troubleshooting

### Database Connection Issues
```bash
# macOS (Homebrew): ensure PostgreSQL is running
brew services list | grep postgres || true
brew services start postgresql || brew services start postgresql@16

# Linux (systemd): ensure PostgreSQL is running
sudo systemctl status postgresql || sudo systemctl start postgresql

# Create DB if missing (adjust user/password as needed)
createdb -h localhost -p 5432 -U postgres dbn_trust_management || true

# Test connection (explicit host/port)
psql -h localhost -p 5432 -U postgres -d dbn_trust_management -c "SELECT 1"

# If your local role isn't 'postgres', update .env accordingly, e.g.:
# DB_USER=$(whoami)
# DB_PASSWORD=""  # often empty for local role
```

If you see ECONNREFUSED during `npm run migrate`:
- Verify the service is running and listening on `DB_HOST:DB_PORT`.
- Confirm firewall or socket restrictions aren’t blocking TCP on 5432.
- Ensure the database `DB_NAME` exists; create with `createdb` above.
- Align credentials: either create the `postgres` role with a password, or set `DB_USER`/`DB_PASSWORD` to your local role.

### Phase 4 API Connection Issues
```bash
# Check Phase 4 service is running
curl http://localhost:3000/health

# Check DID resolution works
curl http://localhost:3000/api/v1/dids/did:web:example.com/document
```

### Message Delivery Failures

Check the messages table for failed messages:
```sql
SELECT id, message_id, type, state, error_message, retry_count
FROM messages
WHERE state = 'failed';
```

Retry failed messages:
```bash
curl -X POST http://localhost:3001/api/v1/messages/{message-id}/retry
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

## Technology Stack (Summary)
| Layer | Tech |
|-------|------|
| Language | TypeScript (Node.js 20) |
| Framework | Express 5 |
| Database | PostgreSQL 16 (JSONB, GIN, full-text search, tsvector) |
| Validation | Zod middleware (body/query/params) |
| Logging | Winston (structured; silence via `DEBUG_LOGS` unset in tests) |
| DID / Crypto | Phase 4 API (encrypt/decrypt, DID resolution, JWS) |
| Testing | Jest + Supertest + ts-jest (runInBand) |
| Protocols | Registry: BasicMessage, TrustPing, Connection |
| CI | GitHub Actions (Node 20) |

## Recent Improvements
- Retry logic: outbound message retry reuses existing pending DB row.
- Validation middleware: fixed Express 5 getter-only `req.query` / `req.params` reassignment (now uses `Object.assign`).
- Idempotent migrations: duplicate table/index errors skipped & recorded.
- Phase4 client: timeout (AbortController) + API error branches tested.
- Error paths: Added tests for unknown error handler branch and protocol negative scenarios.
- Migration error simulation: tests for `ECONNREFUSED`, `28P01`, `42P07`.

## Testing & Coverage
```bash
npm test              # full test suite
npm run test:watch    # watch mode
npm run test:coverage # coverage summary
```
Current snapshot (Phase 2 end): Statements ~84%, Lines ~86%, Branches ~68%, Functions ~75%.
High coverage modules: `ConnectionManager`, `Phase4Client`, `MessageRouter`, validation middleware, error handler.
Improved: `migrate.ts` ~77% after error simulation.

Reliability measures: sequential Jest (`--runInBand`), deterministic UUID mocks, DB pool closed after tests.

## Developer Notes
- Enable test debug logs: `DEBUG_LOGS=1 npm test`.
- Add protocol: implement `supports()` + `handle()` then register in `initializeProtocols()`.
- Consider WebSocket / queue transport abstraction around `sendToEndpoint`.
- Potential next badge: generate coverage shield via CI using `lcov.info`.

## License

[Your License Here]

## Support

For issues and questions:
- GitHub Issues: [Repository Issues]
- Documentation: `/docs`
- Email: support@example.com
```

## Step 13.7: .gitignore
```
# .gitignore
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist/
build/
*.js
*.js.map
!jest.config.js

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Testing
coverage/
*.lcov
.nyc_output/

# Logs
logs/
*.log

# Database
*.db
*.sqlite

# Temporary files
tmp/
temp/