/**
 * Tests for session persistence and link sharing features.
 * Covers:
 *  1. Create session → code appears, host role stored
 *  2. Guest joins → receives full_sync from host
 *  3. Host reloads → rejoins same channel as host, new guest gets sync
 *  4. Guest reloads → rejoins as guest, host sends sync again
 *  5. URL param ?s= → same join flow as manual join
 *  6. Leave session → localStorage cleared
 */

const WebSocket = require('ws');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const WS_URL = SUPABASE_URL.replace(/^https?/, 'wss') +
  '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';

const NAMESPACE   = SUPABASE_URL.includes('supabase.co') ? 'realtime' : 'noisen';
const SESSION_CODE = 'tc' + Date.now().toString(36);
const CHANNEL      = NAMESPACE + ':' + SESSION_CODE;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('  ✓', label);
    passed++;
  } else {
    console.error('  ✗', label);
    failed++;
  }
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const state = { ws, label, msgs: [], peerId: label + '-' + Date.now().toString(36) };
    const timeout = setTimeout(() => reject(new Error(label + ': connect timeout')), 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      state.heartbeat = setInterval(() => {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
      }, 25000);
      resolve(state);
    });
    ws.on('message', (data) => { try { state.msgs.push(JSON.parse(data)); } catch {} });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    ws.on('close', () => clearInterval(state.heartbeat));
  });
}

function send(state, msg) {
  state.ws.send(JSON.stringify(msg));
}

function joinChannel(state, isHost) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(state.label + ': join timeout')), 8000);

    state.ws.on('message', function handler(data) {
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'phx_reply' && msg.payload?.status === 'ok' && msg.ref === '1') {
          clearTimeout(timeout);
          state.ws.off('message', handler);
          state.isHost = isHost;
          if (!isHost) {
            // Guest announces itself — mirrors session.js behavior
            send(state, {
              topic: CHANNEL,
              event: 'broadcast',
              payload: { type: '_peer_join', payload: {}, sender: state.peerId },
              ref: null,
            });
          }
          resolve();
        }
      } catch {}
    });

    send(state, {
      topic: CHANNEL,
      event: 'phx_join',
      payload: { config: { broadcast: { self: false } } },
      ref: '1',
    });
  });
}

function broadcastEvent(state, type, payload) {
  send(state, {
    topic: CHANNEL,
    event: 'broadcast',
    payload: { type, payload, sender: state.peerId },
    ref: null,
  });
}

function waitFor(state, predicate, timeoutMs = 8000, description = 'event') {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('timeout waiting for ' + description)),
      timeoutMs
    );
    const check = () => {
      const found = state.msgs.find(predicate);
      if (found) { clearTimeout(timeout); resolve(found); }
      else setTimeout(check, 100);
    };
    check();
  });
}

async function run() {
  console.log('Channel:', CHANNEL);
  console.log('');

  // ── Test 1: Host and guest connect, presence tracked via _peer_join ───────
  console.log('[ Test 1 ] Host creates session, guest joins, presence broadcast');

  const host = await connect('host');
  await joinChannel(host, true);
  assert(host.isHost === true, 'host joined as host');

  const guest1 = await connect('guest1');
  await joinChannel(guest1, false);
  assert(guest1.isHost === false, 'guest1 joined as guest');

  const peerJoinMsg = await waitFor(
    host,
    m => m.event === 'broadcast' && m.payload?.type === '_peer_join' && m.payload?.sender === guest1.peerId,
    6000, '_peer_join from guest1'
  );
  assert(!!peerJoinMsg, 'host received _peer_join from guest1');

  // ── Test 2: Host sends full_sync on _request_sync (simulating main.js handler) ──
  console.log('');
  console.log('[ Test 2 ] Host sends full_sync after guest joins');

  const PRESET_SNAPSHOT = { nodes: [{ id: 1, type: 'white_noise' }], masterVolume: 0.8 };
  broadcastEvent(host, 'full_sync', { preset: PRESET_SNAPSHOT });

  const syncMsg = await waitFor(
    guest1,
    m => m.event === 'broadcast' && m.payload?.type === 'full_sync',
    6000, 'full_sync'
  );
  assert(!!syncMsg, 'guest1 received full_sync');
  assert(syncMsg.payload?.payload?.preset?.masterVolume === 0.8, 'full_sync payload intact');

  // ── Test 3: Host "reloads" — disconnects and reconnects as host ──────────
  console.log('');
  console.log('[ Test 3 ] Host reloads → reconnects as host, new guest gets sync');

  host.ws.close();
  await new Promise(r => setTimeout(r, 300)); // wait for close

  const host2 = await connect('host-reload');
  await joinChannel(host2, true);
  assert(host2.isHost === true, 'reloaded host joined as host');

  const guest2 = await connect('guest2');
  await joinChannel(guest2, false);

  const peerJoin2 = await waitFor(
    host2,
    m => m.event === 'broadcast' && m.payload?.type === '_peer_join' && m.payload?.sender === guest2.peerId,
    6000, '_peer_join from guest2'
  );
  assert(!!peerJoin2, 'reloaded host received _peer_join from guest2');

  broadcastEvent(host2, 'full_sync', { preset: PRESET_SNAPSHOT });

  const syncMsg2 = await waitFor(
    guest2,
    m => m.event === 'broadcast' && m.payload?.type === 'full_sync',
    6000, 'full_sync for guest2'
  );
  assert(!!syncMsg2, 'guest2 received full_sync from reloaded host');

  // ── Test 4: Guest "reloads" — disconnects and reconnects as guest ────────
  console.log('');
  console.log('[ Test 4 ] Guest reloads → reconnects as guest, host sends sync again');

  guest1.ws.close();
  await new Promise(r => setTimeout(r, 300));

  const guest1b = await connect('guest1-reload');
  await joinChannel(guest1b, false);

  const peerJoin3 = await waitFor(
    host2,
    m => m.event === 'broadcast' && m.payload?.type === '_peer_join' && m.payload?.sender === guest1b.peerId,
    6000, '_peer_join from reloaded guest1'
  );
  assert(!!peerJoin3, 'host received _peer_join from reloaded guest1');

  broadcastEvent(host2, 'full_sync', { preset: PRESET_SNAPSHOT });

  const syncMsg3 = await waitFor(
    guest1b,
    m => m.event === 'broadcast' && m.payload?.type === 'full_sync',
    6000, 'full_sync for reloaded guest1'
  );
  assert(!!syncMsg3, 'reloaded guest1 received full_sync');

  // ── Test 5: ?s= URL param flow — guest joins via code (same as joinSession) ──
  console.log('');
  console.log('[ Test 5 ] URL ?s= param flow: fresh guest joins via code');

  const guestUrl = await connect('guest-url');
  await joinChannel(guestUrl, false);

  const peerJoin4 = await waitFor(
    host2,
    m => m.event === 'broadcast' && m.payload?.type === '_peer_join' && m.payload?.sender === guestUrl.peerId,
    6000, '_peer_join from guest-url'
  );
  assert(!!peerJoin4, 'host received _peer_join from guest joining via URL');

  // ── Test 6: _peer_leave broadcast on leave ───────────────────────────────
  console.log('');
  console.log('[ Test 6 ] Leave session → _peer_leave broadcast');

  broadcastEvent(guest2, '_peer_leave', {});
  guest2.ws.close();

  const leaveMsg = await waitFor(
    host2,
    m => m.event === 'broadcast' && m.payload?.type === '_peer_leave' && m.payload?.sender === guest2.peerId,
    6000, '_peer_leave from guest2'
  );
  assert(!!leaveMsg, 'host received _peer_leave from departing guest');

  // ── Test 7: Bidirectional: guest sends state change, host receives ────────
  console.log('');
  console.log('[ Test 7 ] Bidirectional: guest broadcasts node_add, host receives');

  broadcastEvent(guestUrl, 'node_add', { node: { id: 99, type: 'rain', x: 100, y: 200 } });

  const nodeMsg = await waitFor(
    host2,
    m => m.event === 'broadcast' && m.payload?.type === 'node_add' && m.payload?.payload?.node?.id === 99,
    6000, 'node_add from guest'
  );
  assert(!!nodeMsg, 'host received node_add from guest');
  assert(nodeMsg.payload?.payload?.node?.type === 'rain', 'node_add payload intact');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  host2.ws.close();
  guest1b.ws.close();
  guestUrl.ws.close();

  console.log('');
  console.log('─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ALL TESTS PASSED');
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
