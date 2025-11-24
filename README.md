# DBN Trust Relationship Management

![CI](https://github.com/scanon56/dbn-trust-relationship-management/actions/workflows/ci.yml/badge.svg?branch=main)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/scanon56/dbn-trust-relationship-management/gh-badges/badges/coverage.json)

Phase 2 of the Decentralized Business Network Platform - DIDComm-based peer-to-peer connection and message management.

## Overview

The Trust Relationship Management service provides:
- **DIDComm Connection Protocol** - Establish secure peer-to-peer connections
### Database Helper (Quick Start)
```bash
# From project root
./scripts/db-helper.sh test          # Check DB connectivity
./scripts/db-helper.sh connections   # List recent connections
./scripts/db-helper.sh console       # Open psql (exit with \q)
```
Requires `psql` in PATH and `.env` at the project root. See `scripts/README.md` for more.
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
- ✅ Correlation IDs for invitation & handshake tracing (`dbn:cid`)

## Architecture
```
┌─────────────────────────────────────────────────────┐
│              Trust Relationship Management          │
│                    (Port 3001)                      │
│                                                     │
│  ┌──────────────┐        ┌──────────────┐          │
│         └───────────┬───────────┘                  │
```

**Alice creates invitation:**
```bash
curl -X POST http://localhost:3001/api/v1/connections/invitations \
  -H "Content-Type: application/json" \
  -d '{
    "myDid": "did:web:example.com:alice",
    "label": "Alice Agent",
    "goal": "Establish business connection"
  }'
curl -X POST http://localhost:3001/api/v1/connections/invitations \
  -H "Content-Type: application/json" \
  -d '{
    "myDid": "did:web:example.com:alice",
    "label": "Alice Agent",
    "targetDid": "did:web:example.com:bob",
    "goal": "Private connection for Bob only"
  }'
```bash
curl -X POST http://localhost:3001/api/v1/connections/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "invitation": "<invitation-url>",
    "myDid": "did:web:example.com:bob",
    "label": "Bob Agent"
  }'
```

Accept targeted invitation (if you created one above):
```bash
curl -X POST http://localhost:3001/api/v1/connections/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "invitation": "<invitation-url>",
    "myDid": "did:web:example.com:bob",
    "label": "Bob Agent"
  }'

### Correlation IDs (Tracing)
Each invitation embeds a correlation ID (`dbn:cid`) used to link logs across creation, acceptance, and connection request dispatch.
Query locally:
```sql
SELECT id, state, metadata->>'correlationId' AS correlation_id
FROM connections
WHERE state IN ('invited','requested','responded','active');
```
Filter structured logs (example):
```bash
grep 'correlationId' server.log | grep '<your-correlation-id>'
```
If an incoming invitation lacks `dbn:cid`, one is generated at acceptance.

Decode an invitation URL or raw `_oob` value:
```bash
node scripts/decode-oob.js 'https://didcomm.org/oob?_oob=eyJAdHlwZSI6ICJodHRwczovL2RpZGNvbW0ub3JnL291dC1vZi1iYW5kLzIuMC9pbnZpdGF0aW9uIiwgImRibiJ...' 
# or
node scripts/decode-oob.js eyJAdHlwZSI6Imh0dHBzOi8vZGlkY29tbS5vcmcvb3V0LW9mLWJhbmQvMi4wL2ludml0YXRpb24iLCJAYWlkIjoiLi4uIn0
```
Outputs full invitation JSON plus correlation ID summary.
```

### 2. Activate Connection (Dev Helper)
```bash
curl -X POST http://localhost:3001/api/v1/connections/{connection-id}/activate
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
│   ├── helpers/            # Test helpers
│   └── setup.ts            # Jest setup
├── docs/
│   ├── architecture.md     # Architecture documentation
│   └── protocols.md        # Protocol specifications
└── package.json
```

## Development

### Dual-Instance (Separate Databases)
For realistic two-agent testing run each server against its own database (same Postgres cluster, different DB names):

```bash
# 1. Create & migrate both databases
./scripts/db-init-dual.sh  # creates dbn_trust_management_a / dbn_trust_management_b and runs migrations

# 2. Start Agent A (port 3001)
PORT=3001 DB_NAME=dbn_trust_management_a DIDCOMM_ENDPOINT=http://localhost:3001/didcomm npm run dev

# 3. Start Agent B (port 3002)
PORT=3002 DB_NAME=dbn_trust_management_b DIDCOMM_ENDPOINT=http://localhost:3002/didcomm npm run dev

# 4. (Optional) Playground
npm run playground:dev
```

Shortcut (all three concurrently):
```bash
npm run demo:dual:db
```

Migrate individually:
```bash
npm run migrate:agentA
npm run migrate:agentB
```

Inspect each database:
```bash
DB_NAME=dbn_trust_management_a ./scripts/db-helper.sh connections
DB_NAME=dbn_trust_management_b ./scripts/db-helper.sh connections
```

Connection rows are now isolated per agent: the inviter advances its single record through states without clashing with the invitee’s independent record.

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

-- Check invitation metadata
SELECT 
  id,
  my_did,
  their_did,
  state,
  metadata->>'invitationType' as invitation_type,
  metadata->>'targetDid' as target_did
FROM connections
WHERE state = 'invited';

-- Check accepted connections
SELECT 
  id,
  my_did,
  their_did,
  state,
  metadata->>'wasTargeted' as was_targeted
FROM connections
WHERE state = 'requested';


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
- Multi-DB Runs: Use `DB_NAME=...` prefixes or new dual-demo scripts. Avoid sharing one DB if you need realistic cross-agent handshake progression.
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