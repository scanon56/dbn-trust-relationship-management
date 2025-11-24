# Dual Agent DIDComm Playground

This simple static UI lets you exercise the connection + messaging flow between two simulated agents (A & B) using the local Trust Relationship Management API.

## Prerequisites
- Server running locally on `http://localhost:3001` (start with `npm run dev` or your usual command)
- Database migrated & reachable (use `./scripts/db-helper.sh status` if needed)
- Node.js 20+

## Quick Start
Run the playground with Vite (local dev server):

```sh
npm install
npm run playground:dev
```

Open the printed URL (typically `http://localhost:5173`).

Or start both API and the playground together from the repo root:

```sh
npm run demo
```

Build static assets and preview the production build:

```sh
npm run playground:build
npm run playground:preview
```

## Usage Flow (Multi-Instance)
You should run TWO API server instances for a real handshake:

```sh
# Terminal 1 (Agent A backend)
PORT=3001 DIDCOMM_ENDPOINT=http://localhost:3001/didcomm npm run dev

# Terminal 2 (Agent B backend)
PORT=3002 DIDCOMM_ENDPOINT=http://localhost:3002/didcomm npm run dev
```

Then start the playground (can be a third terminal):

```sh
npm run playground:dev
```

Flow:
1. In Agent A panel set API Base `http://localhost:3001`, fill DID, click **Create Invitation**.
2. Invitation URL appears and is copied to Agent B panel.
3. In Agent B panel set API Base `http://localhost:3002`, fill DID, click **Accept Invitation**.
4. Agent B sends a DIDComm connection request to Agent A's DIDComm endpoint; Agent A auto-sends a response; both sides transition to `complete` automatically. Status text updates while polling.
5. When status shows `complete`, messaging buttons enable; exchange BasicMessage DIDComm messages.

### Optional: Separate Databases for Realistic Isolation
You can give each agent its own database so each side only sees its local connection row:

```sh
./scripts/db-init-dual.sh  # creates & migrates dbn_trust_management_a and _b

PORT=3001 DB_NAME=dbn_trust_management_a DIDCOMM_ENDPOINT=http://localhost:3001/didcomm npm run dev
PORT=3002 DB_NAME=dbn_trust_management_b DIDCOMM_ENDPOINT=http://localhost:3002/didcomm npm run dev
```

Or run all three (A, B, UI) concurrently:
```sh
npm run demo:dual:db
```

Instance A (Inviter)                    Instance B (Invitee)
Port 3001                               Port 3002
─────────────────────────────────────────────────────────────

1. Create Invitation
   ↓
   Generate URL
   ↓
   [Share URL manually] ──────────────→ 2. Accept Invitation
                                           ↓
                                           Extract A's endpoint
                                           ↓
                                           Create peer DID
                                           ↓
                                           Build request message
                                           ↓
                                           Encrypt with A's DID
                                           ↓
   3. Receive Request  ←─────────────────  POST to A's endpoint
      POST /api/v1/messages/inbound        (http://localhost:3001)
      ↓
      Decrypt message
      ↓
      Route to ConnectionProtocol
      ↓
      handleRequest()
      ↓
      Build response message
      ↓
      Encrypt with B's DID
      ↓
      POST to B's endpoint ──────────────→ 4. Receive Response
      (http://localhost:3002)                POST /api/v1/messages/inbound
                                             ↓
                                             Decrypt message
                                             ↓
                                             Route to ConnectionProtocol
                                             ↓
                                             handleResponse()
                                             ↓
                                             Connection COMPLETE
                                             ↓
                                             Build ack message
                                             ↓
                                             Encrypt
                                             ↓
   5. Receive Ack      ←─────────────────  POST to A's endpoint
      POST /api/v1/messages/inbound
      ↓
      handleAck()
      ↓
      Connection COMPLETE

In dual-DB mode each agent’s connection record advances independently (inviter: invited→requested→complete, invitee: requested→responded→complete). Use the correlation ID (`dbn:cid`) to correlate handshake logs across both databases.

Manual activation buttons are deprecated; handshake auto-completes when both servers are running. If only one server runs the flow cannot progress.

## Notes
- Targeted invitation: Provide `Target DID` before creating invitation (optional). If present, only that DID should accept meaningfully.
- Handshake states: `invited → requested → responded → complete` occur automatically across the two backends.
- Message type used: `https://didcomm.org/basicmessage/2.0/message` with a `body.content` string.
- Refreshing messages queries `/api/v1/messages?connectionId=...`.
- Correlation ID: Invitation URLs carry a `dbn:cid` inside the base64 `_oob` segment. Decode it to correlate Create → Accept → Request logs.
- Polling: The UI polls connection state every 2s until `complete` or timeout (~2 min).
- Transport Health: Each panel shows DIDComm transport health (GET `/didcomm/health`). Values: `healthy`, `network`, `http <code>`, or `unknown`. A failing transport prevents handshake messages from arriving.
- Live Messages (SSE): The playground auto-subscribes each panel to `GET /api/v1/events/basicmessages` after invitation creation / acceptance. Incoming BasicMessage DIDComm packets appear instantly with a green inbound indicator. The "SSE" status badge shows `connected`, `error`, or `idle`.
- Test Flag Warning: If you accidentally start either backend with `SKIP_DELIVERY=true`, outbound messages will NOT be transported; SSE will never receive inbound events (appears as a regression). Ensure `SKIP_DELIVERY` is unset/`false` for interactive multi-agent demos.

## Extending
- Add Trust Ping: POST a trust-ping DIDComm message with a different `type` value.
- Persist UI state: Wrap local state in `localStorage` for reloading.
- Bundle: Convert to a small Vite setup if you want hot reload and modular TS.

## Troubleshooting
| Issue | Resolution |
|-------|------------|
| Invitation accept fails | Ensure both API bases are correct (3001 / 3002) and servers running. |
| Stuck in `invited` | Agent B server not running; request never delivered to A. |
| Stuck in `requested` | Agent A server not running or auto-response failed; use manual Activate as fallback. |
| Transport shows `network` | Server unreachable; verify port & process, firewall, or container mapping. |
| Transport shows `http 415` | DIDComm content-type mismatch; backend must accept `application/didcomm-encrypted+json`. |
| Cannot send message | Wait until status shows `complete`. |
| Empty message list | Use **Refresh Messages** after sending or acceptance. |
| No live (green) inbound messages but polling works | Verify SSE endpoint reachable (`curl -i http://localhost:3001/api/v1/events/basicmessages`), and confirm `SKIP_DELIVERY` is not set to `true`. |
| CORS errors | Confirm server middleware; adjust if cross-origin hosting playground. |

## Cleanup
This playground is self-contained static HTML/TS (built by Vite). Remove the directory if no longer needed: `rm -rf examples/dual-agent-playground`.
