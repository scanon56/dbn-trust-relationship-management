type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
interface JSONObject { [key: string]: JSONValue }
interface JSONArray extends Array<JSONValue> {}

interface ApiResponse<T> { data: T; error?: { message: string } }

interface Connection {
  id: string;
  state?: string;
}

interface MessageRecord {
  id?: string;
  type: string;
  body?: { content?: string };
  direction?: 'inbound' | 'outbound';
}

// Track displayed messages to avoid duplicates when polling
const displayedMessageIds: Record<'a' | 'b', Set<string>> = { a: new Set(), b: new Set() };
let messagePollers: Record<'a'|'b', number | null> = { a: null, b: null };
let sseSources: Record<'a'|'b', EventSource | null> = { a: null, b: null };

function getApiBase(panel: 'a' | 'b'): string {
  const inputId = panel === 'a' ? 'aApiBase' : 'bApiBase';
  const value = (document.getElementById(inputId) as HTMLInputElement | null)?.value?.trim();
  return value && /^https?:\/\//.test(value) ? value.replace(/\/$/, '') : (panel === 'a' ? 'http://localhost:3001' : 'http://localhost:3002');
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

function log(panel: 'a' | 'b', msg: string): void {
  const box = el<HTMLDivElement>(`${panel}Log`);
  const time = new Date().toISOString();
  box.textContent = `[${time}] ${msg}\n` + box.textContent;
}

function addMsg(panel: 'a' | 'b', message: MessageRecord): void {
  const list = el<HTMLDivElement>(`${panel}Messages`);
  const div = document.createElement('div');
  div.className = 'msg ' + (message.direction || 'outbound');
  const typeName = message.type.split('/').slice(-1)[0];
  const content = message.body?.content ?? '(no body)';
  div.innerHTML = `<strong>${typeName}</strong> - <span>${content}</span>`;
  list.prepend(div);
  if (message.id) {
    displayedMessageIds[panel].add(message.id);
  }
}

async function fetchAndRenderMessages(panel: 'a' | 'b', connectionId: string) {
  try {
    const data = await api<{ messages: MessageRecord[] }>(panel, `/api/v1/messages?connectionId=${connectionId}`);
    // Render only new messages
    const newMessages = data.messages.filter(m => !m.id || !displayedMessageIds[panel].has(m.id));
    newMessages.forEach(m => addMsg(panel, m));
    if (newMessages.length) {
      log(panel, `Synced ${newMessages.length} new message(s)`);
    }
  } catch (e: any) {
    log(panel, 'Message sync error: ' + e.message);
  }
}

function startMessagePolling(panel: 'a' | 'b', connectionId: string) {
  // Clear existing poller
  if (messagePollers[panel]) {
    clearInterval(messagePollers[panel]!);
    messagePollers[panel] = null;
  }
  const autoSyncCheckbox = document.getElementById(panel === 'a' ? 'aAutoSync' : 'bAutoSync') as HTMLInputElement | null;
  const interval = () => {
    if (!autoSyncCheckbox || autoSyncCheckbox.checked) {
      fetchAndRenderMessages(panel, connectionId);
    }
  };
  // Initial immediate fetch
  interval();
  messagePollers[panel] = window.setInterval(interval, 3000); // every 3s
}

function startLiveMessages(panel: 'a' | 'b') {
  // Close existing source
  if (sseSources[panel]) {
    sseSources[panel]!.close();
    sseSources[panel] = null;
  }
  const base = getApiBase(panel);
  try {
    const src = new EventSource(base + '/api/v1/events/basicmessages');
    src.addEventListener('basicmessage', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        // If connectionId filtering is desired, ensure it matches current connection
        const currentId = el(panel === 'a' ? 'aConnectionId' : 'bConnectionId').textContent?.trim();
        if (currentId && currentId !== '(none)' && payload.connectionId && payload.connectionId !== currentId) {
          return; // ignore messages from other connections
        }
        addMsg(panel, {
          id: payload.messageId,
          type: 'https://didcomm.org/basicmessage/2.0/message',
          body: { content: payload.content },
          direction: 'inbound'
        });
        log(panel, 'Live message received');
      } catch (e: any) {
        log(panel, 'Live message parse error: ' + e.message);
      }
    });
    src.onerror = () => {
      log(panel, 'SSE error; reconnecting...');
      setTimeout(() => startLiveMessages(panel), 3000);
    };
    sseSources[panel] = src;
    log(panel, 'Subscribed to live messages');
  } catch (e: any) {
    log(panel, 'Failed to start live messages: ' + e.message);
  }
}

async function api<T>(panel: 'a' | 'b', path: string, opts: RequestInit = {}): Promise<T> {
  const base = getApiBase(panel);
  const res = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let json: ApiResponse<T> | { raw: string };
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = (json as ApiResponse<T>).error?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return (json as ApiResponse<T>).data;
}

// Agent A actions
function friendlyState(raw?: string): string {
  switch (raw) {
    case 'invited': return 'invited';
    case 'requested': return 'requesting';
    case 'responded': return 'responded';
    case 'complete': return 'complete';
    case 'error': return 'error';
    default: return raw || 'unknown';
  }
}

function updateStatus(panel: 'a' | 'b', rawState: string) {
  const panelEl = panel === 'a' ? document.querySelector('#agentA .status') : document.querySelector('#agentB .status');
  if (panelEl) panelEl.textContent = (panel === 'a' ? 'A: ' : 'B: ') + friendlyState(rawState);
}

function setTransportHealth(panel: 'a' | 'b', state: 'ok' | 'fail' | 'warn' | 'unknown', label?: string) {
  const id = panel === 'a' ? 'aTransportHealth' : 'bTransportHealth';
  const elNode = document.getElementById(id);
  if (!elNode) return;
  elNode.className = `health ${state}`;
  elNode.textContent = label || state;
}

async function checkTransport(panel: 'a' | 'b') {
  const base = getApiBase(panel);
  // DIDComm health endpoint
  const url = base.replace(/\/$/, '') + '/didcomm/health';
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      setTransportHealth(panel, 'fail', 'http ' + res.status);
      return;
    }
    const json = await res.json().catch(() => ({}));
    if ((json as any).data?.status === 'healthy') {
      setTransportHealth(panel, 'ok', 'healthy');
    } else {
      setTransportHealth(panel, 'warn', 'unknown');
    }
  } catch (e: any) {
    setTransportHealth(panel, 'fail', e?.name === 'TypeError' ? 'network' : 'error');
  }
}

// Periodic transport polling
setInterval(() => {
  checkTransport('a');
  checkTransport('b');
}, 10000); // every 10s

// Initial check shortly after load
setTimeout(() => {
  checkTransport('a');
  checkTransport('b');
}, 500);

async function pollConnection(panel: 'a' | 'b', id: string) {
  let attempts = 0;
  const maxAttempts = 60; // ~2 minutes at 2s
  const timer = setInterval(async () => {
    attempts++;
    try {
      const data = await api<{ connection: Connection }>(panel, `/api/v1/connections/${id}`);
      const state = data.connection.state || 'unknown';
      updateStatus(panel, state);
      if (state === 'complete') {
        clearInterval(timer);
        if (panel === 'a') {
          el<HTMLButtonElement>('aSendMessageBtn').disabled = false;
          el<HTMLButtonElement>('aRefreshMessagesBtn').disabled = false;
        } else {
          el<HTMLButtonElement>('bSendMessageBtn').disabled = false;
          el<HTMLButtonElement>('bRefreshMessagesBtn').disabled = false;
        }
        log(panel, 'Connection complete');
        startMessagePolling(panel, id);
      }
    } catch (e: any) {
      if (attempts % 5 === 0) log(panel, 'Poll error: ' + e.message);
    }
    if (attempts >= maxAttempts) {
      clearInterval(timer);
      log(panel, 'Stopped polling connection state (timeout)');
    }
  }, 2000);
}

el<HTMLButtonElement>('aCreateInvitationBtn').addEventListener('click', async () => {
  const myDid = el<HTMLInputElement>('aDid').value.trim();
  const label = el<HTMLInputElement>('aLabel').value.trim();
  const goal = el<HTMLInputElement>('aGoal').value.trim();
  const targetDid = el<HTMLInputElement>('aTargetDid').value.trim();
  try {
    const body: any = { myDid, label: label || undefined, goal: goal || undefined };
    if (targetDid) body.targetDid = targetDid;
    const data = await api<{ connection: Connection; invitationUrl: string }>(
      'a',
      '/api/v1/connections/invitations',
      { method: 'POST', body: JSON.stringify(body) },
    );
    const { connection, invitationUrl } = data;
    el('aConnectionId').textContent = connection.id;
    el('aInvitationUrl').textContent = invitationUrl;
    // Activation button deprecated (protocol now auto-completes via ack)
    el<HTMLButtonElement>('aActivateBtn').disabled = true;
    el<HTMLInputElement>('bInvitationUrl').value = invitationUrl;
    log('a', 'Invitation created');
    updateStatus('a', connection.state || 'invited');
    pollConnection('a', connection.id);
    startLiveMessages('a');
  } catch (e: any) {
    log('a', 'Error creating invitation: ' + e.message);
    checkTransport('a');
  }
});

// Manual activation removed: endpoint deprecated under Aries handshake flow

el<HTMLButtonElement>('aSendMessageBtn').addEventListener('click', async () => {
  const id = el('aConnectionId').textContent.trim();
  const content = el<HTMLTextAreaElement>('aMessage').value.trim();
  if (!content) return;
  try {
    const data = await api<{ message: MessageRecord }>(
      'a',
      '/api/v1/messages',
      { method: 'POST', body: JSON.stringify({ connectionId: id, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content } }) },
    );
    addMsg('a', data.message);
    el<HTMLTextAreaElement>('aMessage').value = '';
    log('a', 'Message sent');
  } catch (e: any) {
    log('a', 'Send failed: ' + e.message);
    checkTransport('a');
  }
});

el<HTMLButtonElement>('aRefreshMessagesBtn').addEventListener('click', async () => {
  const id = el('aConnectionId').textContent.trim();
  if (!id || id === '(none)') return;
  try {
    await fetchAndRenderMessages('a', id);
    log('a', 'Manual sync complete');
  } catch (e: any) {
    log('a', 'Refresh failed: ' + e.message);
    checkTransport('a');
  }
});

// Agent B actions
el<HTMLButtonElement>('bAcceptInvitationBtn').addEventListener('click', async () => {
  const myDid = el<HTMLInputElement>('bDid').value.trim();
  const label = el<HTMLInputElement>('bLabel').value.trim();
  const invitation = el<HTMLInputElement>('bInvitationUrl').value.trim();
  if (!invitation) {
    log('b', 'No invitation URL provided');
    return;
  }
  try {
    const data = await api<{ connection: Connection }>(
      'b',
      '/api/v1/connections/accept-invitation',
      { method: 'POST', body: JSON.stringify({ invitation, myDid, label }) },
    );
    el('bConnectionId').textContent = data.connection.id;
    el<HTMLButtonElement>('bActivateBtn').disabled = true; // deprecated
    log('b', 'Invitation accepted');
    updateStatus('b', data.connection.state || 'requested');
    pollConnection('b', data.connection.id);
    startLiveMessages('b');
  } catch (e: any) {
    log('b', 'Accept failed: ' + e.message);
    checkTransport('b');
  }
});

// Manual activation removed for Agent B as well

el<HTMLButtonElement>('bSendMessageBtn').addEventListener('click', async () => {
  const id = el('bConnectionId').textContent.trim();
  const content = el<HTMLTextAreaElement>('bMessage').value.trim();
  if (!content) return;
  try {
    const data = await api<{ message: MessageRecord }>(
      'b',
      '/api/v1/messages',
      { method: 'POST', body: JSON.stringify({ connectionId: id, type: 'https://didcomm.org/basicmessage/2.0/message', body: { content } }) },
    );
    addMsg('b', data.message);
    el<HTMLTextAreaElement>('bMessage').value = '';
    log('b', 'Message sent');
  } catch (e: any) {
    log('b', 'Send failed: ' + e.message);
    checkTransport('b');
  }
});

el<HTMLButtonElement>('bRefreshMessagesBtn').addEventListener('click', async () => {
  const id = el('bConnectionId').textContent.trim();
  if (!id || id === '(none)') return;
  try {
    await fetchAndRenderMessages('b', id);
    log('b', 'Manual sync complete');
  } catch (e: any) {
    log('b', 'Refresh failed: ' + e.message);
    checkTransport('b');
  }
});

// Re-check transport when API base inputs change
['aApiBase','bApiBase'].forEach(id => {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) {
    input.addEventListener('change', () => {
      const panel = id.startsWith('a') ? 'a' : 'b';
      setTransportHealth(panel as 'a' | 'b', 'unknown', 'checking');
      checkTransport(panel as 'a' | 'b');
    });
  }
});
