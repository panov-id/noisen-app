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
let presenceCount = 0;

const participantIds = new Set();

export function sessionActive() { return socket !== null && socket.readyState === WebSocket.OPEN; }
export function sessionCode()   { return channel ? channel.replace('noisen:', '') : null; }
export function participantCount() { return presenceCount; }

// ── WebSocket Supabase Realtime connection ────────────────────

function realtimeUrl() {
  const base = SUPABASE_URL.replace(/^https?/, 'wss');
  return `${base}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
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
    payload: {
      config: {
        broadcast: { self: false },
        presence: { key: peerId },
      },
    },
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
      // Supabase Realtime heartbeat
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
        resolve();
        return;
      }

      if (event === 'presence_diff') {
        const joins  = Object.keys(payload?.joins  ?? {});
        const leaves = Object.keys(payload?.leaves ?? {});
        joins.forEach(id  => participantIds.add(id));
        leaves.forEach(id => participantIds.delete(id));
        presenceCount = participantIds.size + 1; // +1 for self
        onPresence?.(presenceCount);

        // New joiner: host sends full state sync
        if (isHost && joins.length > 0) {
          onEvent?.('_request_sync', {});
        }
        return;
      }

      if (event === 'broadcast') {
        const { type, payload: data, sender } = payload ?? {};
        if (!type || sender === peerId) return;
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
      presenceCount = 0;
      participantIds.clear();
      onPresence?.(0);
    };
  });
}

// ── Public API ────────────────────────────────────────────────

export async function createSession() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  const code = generateSessionCode();
  await connectAndJoin(`noisen:${code}`, true);
  return code;
}

export async function joinSession(code) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  await connectAndJoin(`noisen:${code.toLowerCase().trim()}`, false);
}

export function leaveSession() {
  if (!socket) return;
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
export function onRemoteEvent(fn)    { onEvent    = fn; }
export function onParticipantChange(fn) { onPresence = fn; }
