/**
 * scripts/handshake-state-log.ts
 *
 * Triggers a DIDComm connection handshake between two running agents (inviter & invitee)
 * and prints ONLY the observed state transitions (derived by polling connection records).
 *
 * Assumptions:
 * - Two agents are already running (e.g. via `npm run demo:dual:db`)
 * - Agent A (inviter) on PORT 3001, Agent B (invitee) on PORT 3002 by default
 * - You provide base DIDs for each via env vars (INVITER_DID, INVITEE_DID)
 *   These are the 'myDid' values used when creating / accepting invitations.
 * - Network & DB are reachable, phase4 encryption service is configured as per normal runtime.
 *
 * Env Vars (override defaults):
 *   INVITER_URL   (default http://localhost:3001)
 *   INVITEE_URL   (default http://localhost:3002)
 *   INVITER_DID   (required)
 *   INVITEE_DID   (required)
 *   HANDSHAKE_TIMEOUT_MS (default 30000)
 *   POLL_INTERVAL_MS     (default 1000)
 *
 * Run:
 *   INVITER_DID=did:example:inviter INVITEE_DID=did:example:invitee npm run handshake:log
 */

interface ApiResponse<T> { success: boolean; data: T }
interface Connection { id: string; state: string; myDid: string; theirDid: string }

const INVITER_URL = process.env.INVITER_URL || 'http://localhost:3001';
const INVITEE_URL = process.env.INVITEE_URL || 'http://localhost:3002';
const INVITER_DID = process.env.INVITER_DID;
const INVITEE_DID = process.env.INVITEE_DID;
const TIMEOUT_MS = parseInt(process.env.HANDSHAKE_TIMEOUT_MS || '30000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '1000', 10);

if (!INVITER_DID || !INVITEE_DID) {
  console.error('Missing required env vars INVITER_DID and/or INVITEE_DID');
  process.exit(1);
}

async function post<T>(base: string, path: string, body: any): Promise<T> {
  const res = await fetch(`${base}/api/v1/connections${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json as ApiResponse<T>).data;
}

async function get<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}/api/v1/connections${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json as ApiResponse<T>).data as T;
}

async function main() {
  console.log('--- DIDComm Handshake Transition Logger ---');
  console.log(`Inviter URL: ${INVITER_URL}`);
  console.log(`Invitee URL: ${INVITEE_URL}`);
  console.log('Starting handshake...');

  // 1. Create invitation on inviter
  const inviteData = await post<{ connection: Connection; invitationUrl: string }>(
    INVITER_URL,
    '/invitations',
    { myDid: INVITER_DID, label: 'Handshake Demo (Inviter)' }
  );
  const inviterConnection = inviteData.connection;
  const invitationUrl = inviteData.invitationUrl;
  console.log(`[STEP] Invitation created: connectionId=${inviterConnection.id}`);
  console.log(`[INFO] Invitation URL: ${invitationUrl}`);

  // 2. Accept invitation on invitee
  const acceptData = await post<{ connection: Connection }>(
    INVITEE_URL,
    '/accept-invitation',
    { myDid: INVITEE_DID, invitation: invitationUrl, label: 'Handshake Demo (Invitee)' }
  );
  const inviteeConnection = acceptData.connection;
  console.log(`[STEP] Invitation accepted: connectionId=${inviteeConnection.id}`);

  // Track transitions
  const inviterStates: string[] = [inviterConnection.state];
  const inviteeStates: string[] = [inviteeConnection.state];

  const start = Date.now();
  let inviterComplete = inviterConnection.state === 'complete';
  let inviteeComplete = inviteeConnection.state === 'complete';

  // Poll both connection records until both active or timeout
  while (!(inviterComplete && inviteeComplete) && Date.now() - start < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    // Fetch updated records
    const inviterLatest = await get<{ connection: Connection }>(
      INVITER_URL,
      `/${inviterConnection.id}`
    ).then(d => d.connection);
    const inviteeLatest = await get<{ connection: Connection }>(
      INVITEE_URL,
      `/${inviteeConnection.id}`
    ).then(d => d.connection);

    if (inviterLatest.state !== inviterStates[inviterStates.length - 1]) {
      console.log(`[TRANSITION] inviter: ${inviterStates[inviterStates.length - 1]} -> ${inviterLatest.state}`);
      inviterStates.push(inviterLatest.state);
    }
    if (inviteeLatest.state !== inviteeStates[inviteeStates.length - 1]) {
      console.log(`[TRANSITION] invitee: ${inviteeStates[inviteeStates.length - 1]} -> ${inviteeLatest.state}`);
      inviteeStates.push(inviteeLatest.state);
    }

    inviterComplete = inviterLatest.state === 'complete';
    inviteeComplete = inviteeLatest.state === 'complete';
  }

  console.log('--- Handshake Result ---');
  if (!(inviterComplete && inviteeComplete)) {
    console.log('[WARN] Handshake did not reach complete state for both parties within timeout.');
  }
  console.log(`Inviter sequence: ${inviterStates.join(' -> ')}`);
  console.log(`Invitee sequence: ${inviteeStates.join(' -> ')}`);

  console.log('--- Suggested Next Step ---');
  console.log('Run: docker compose logs -f | grep "Connection state transition" for raw server log lines');
}

main().catch(err => {
  console.error('Handshake script failed:', err);
  process.exit(1);
});
