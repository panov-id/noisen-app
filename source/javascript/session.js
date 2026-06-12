// ── Multiplayer session via Supabase Realtime ─────────────────
// Uses broadcast channels (WebSocket under the hood, no DB writes).
// Session code = 6-char alphanumeric, shared out-of-band.
//
// Event types:
//   full_sync    — sent to new joiners: entire current state snapshot
//   node_add     — a new node was created
//   node_remove  — a node was deleted
//   node_move    — node dragged to new position
//   node_param   — any node param changed (key/value)
//   global_param — masterVolume, gravityStrength, masterTone, waveSpread changed
//   play_state   — isPlaying, beatMode, bpm changed
//
// Participant counting uses broadcast-based tracking (not Phoenix presence)
// because Supabase Cloud presence_diff requires additional auth setup.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

function generateSessionCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

// ── Session state ─────────────────────────────────────────────

let socket     = null;   // WebSocket to Supabase Realtime
let channel    = null;   // channel name string
let peerId     = null;   // unique ID for this participant
let isHost     = false;
let onEvent    = null;   // callback(type, payload) → called for remote events
let onPresence = null;   // callback(count) → participant count changed

const participantIds = new Set();

export function sessionActive() { return socket !== null && socket.readyState === WebSocket.OPEN; }
export function sessionCode()   { return channel ? channel.split(':').slice(1).join(':') : null; }
export function participantCount() { return participantIds.size + 1; } // +1 for self

// ── WebSocket Supabase Realtime connection ────────────────────

function realtimeUrl() {
  const base = SUPABASE_URL.replace(/^https?/, 'wss');
  // Supabase Cloud and local Kong stack route through Kong → /realtime/v1/websocket.
  // Self-hosted Realtime exposed directly → /socket/websocket.
  const throughKong = SUPABASE_URL.includes(':8000') || SUPABASE_URL.includes('supabase.co');
  const path = throughKong ? '/realtime/v1/websocket' : '/socket/websocket';
  return `${base}${path}?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
}

// Supabase Cloud requires "realtime:" prefix; self-hosted accepts any namespace.
function channelNamespace() {
  return SUPABASE_URL.includes('supabase.co') ? 'realtime' : 'noisen';
}

function sendRaw(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function joinChannel(channelName) {
  channel = channelName;
  peerId  = generateSessionCode() + '-' + Date.now().toString(36);

  sendRaw({
    topic: channel,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false } } },
    ref: '1',
  });
}

function connectAndJoin(channelName, hostMode) {
  return new Promise((resolve, reject) => {
    isHost = hostMode;
    const url = realtimeUrl();
    socket = new WebSocket(url);

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Connection timeout'));
    }, 8000);

    socket.onopen = () => {
      clearTimeout(timeout);
      const heartbeat = setInterval(() => {
        sendRaw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null });
      }, 25000);
      socket._heartbeat = heartbeat;
      joinChannel(channelName);
    };

    socket.onmessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.data); } catch { return; }

      const { topic, event, payload } = msg;
      if (topic !== channel && topic !== 'phoenix') return;

      if (event === 'phx_reply' && payload?.status === 'ok') {
        // Joined successfully. If guest, announce presence so host triggers sync.
        if (!isHost) {
          sendRaw({
            topic: channel,
            event: 'broadcast',
            payload: { type: '_peer_join', payload: {}, sender: peerId },
            ref: null,
          });
        }
        resolve();
        return;
      }

      if (event === 'broadcast') {
        const { type, payload: data, sender } = payload ?? {};
        if (!type || sender === peerId) return;

        // Broadcast-based participant tracking.
        if (type === '_peer_join') {
          participantIds.add(sender);
          onPresence?.(participantCount());
          // Host triggers state sync when a new peer joins.
          if (isHost) onEvent?.('_request_sync', {});
          return;
        }
        if (type === '_peer_leave') {
          participantIds.delete(sender);
          onPresence?.(participantCount());
          return;
        }

        participantIds.add(sender);
        onEvent?.(type, data ?? {});
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    };

    socket.onclose = () => {
      clearInterval(socket._heartbeat);
      socket   = null;
      channel  = null;
      participantIds.clear();
      onPresence?.(0);
    };
  });
}

// ── Public API ────────────────────────────────────────────────

export async function createSession() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  const code = generateSessionCode();
  await connectAndJoin(`${channelNamespace()}:${code}`, true);
  return code;
}

// Rejoin an existing session as the host (e.g., after page reload).
export async function createSessionWithCode(code) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  await connectAndJoin(`${channelNamespace()}:${code.toLowerCase().trim()}`, true);
}

export async function joinSession(code) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  await connectAndJoin(`${channelNamespace()}:${code.toLowerCase().trim()}`, false);
}

export function leaveSession() {
  if (!socket) return;
  sendRaw({
    topic: channel,
    event: 'broadcast',
    payload: { type: '_peer_leave', payload: {}, sender: peerId },
    ref: null,
  });
  sendRaw({ topic: channel, event: 'phx_leave', payload: {}, ref: '99' });
  socket.close();
}

// Broadcast an event to all other participants.
export function broadcast(type, payload) {
  if (!sessionActive()) return;
  sendRaw({
    topic: channel,
    event: 'broadcast',
    payload: { type, payload, sender: peerId },
    ref: null,
  });
}

// Register callbacks from main.js
export function onRemoteEvent(fn)       { onEvent    = fn; }
export function onParticipantChange(fn) { onPresence = fn; }
