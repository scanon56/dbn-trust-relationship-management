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
    const data = await api<{ messages: MessageRecord[] }>('a', `/api/v1/messages?connectionId=${id}`);
    el('aMessages').innerHTML = '';
    data.messages.forEach((m) => addMsg('a', m));
    log('a', 'Messages refreshed');
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
    const data = await api<{ messages: MessageRecord[] }>('b', `/api/v1/messages?connectionId=${id}`);
    el('bMessages').innerHTML = '';
    data.messages.forEach((m) => addMsg('b', m));
    log('b', 'Messages refreshed');
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
