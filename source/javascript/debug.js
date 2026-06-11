// ── In-app debug panel ────────────────────────────────────────
// Toggle with Shift+D or the debug button.
// Shows structured orbit events, memory, and AudioContext stats.

const MAX_EVENTS = 80;
const events = [];
let panel = null;
let visible = false;
let statsInterval = null;

const LEVEL_LABEL = { info: 'INFO', warn: 'WARN', error: 'ERR', orbit: 'ORBIT', mem: 'MEM' };
const LEVEL_CLASS  = { info: 'dbg-info', warn: 'dbg-warn', error: 'dbg-error', orbit: 'dbg-orbit', mem: 'dbg-mem' };

export function dbgLog(level, message, data) {
  const entry = { time: Date.now(), level, message, data };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  if (visible) renderEvents();
}

function formatData(data) {
  if (data == null) return '';
  if (typeof data === 'object') {
    try { return JSON.stringify(data, null, 0); } catch { return String(data); }
  }
  return String(data);
}

function renderEvents() {
  const list = panel?.querySelector('#dbg-events');
  if (!list) return;
  list.innerHTML = '';
  for (let i = events.length - 1; i >= 0; i--) {
    const { time, level, message, data } = events[i];
    const age = ((Date.now() - time) / 1000).toFixed(1);
    const row = document.createElement('div');
    row.className = `dbg-row ${LEVEL_CLASS[level] ?? 'dbg-info'}`;
    row.innerHTML =
      `<span class="dbg-age">${age}s</span>` +
      `<span class="dbg-level">${LEVEL_LABEL[level] ?? level}</span>` +
      `<span class="dbg-msg">${message}</span>` +
      (data != null ? `<span class="dbg-data">${formatData(data)}</span>` : '');
    list.appendChild(row);
  }
}

function memInfo() {
  const mem = performance?.memory;
  if (!mem) return null;
  const mb = v => (v / 1048576).toFixed(1) + ' MB';
  return {
    used: mb(mem.usedJSHeapSize),
    total: mb(mem.totalJSHeapSize),
    limit: mb(mem.jsHeapSizeLimit),
    pct: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1) + '%',
  };
}

function audioInfo() {
  const ctx = Tone?.context?.rawContext;
  if (!ctx) return null;
  return {
    state: ctx.state,
    sampleRate: ctx.sampleRate + ' Hz',
    latency: ctx.baseLatency != null ? (ctx.baseLatency * 1000).toFixed(1) + ' ms' : '—',
    currentTime: ctx.currentTime.toFixed(1) + 's',
  };
}

function updateStats() {
  const mem = memInfo();
  const audio = audioInfo();
  const statsEl = panel?.querySelector('#dbg-stats');
  if (!statsEl) return;

  let html = '';
  if (mem) {
    html += `<div class="dbg-stat-row">
      <span class="dbg-stat-label">JS Heap</span>
      <span class="dbg-stat-val">${mem.used} / ${mem.total}</span>
      <span class="dbg-stat-bar"><span style="width:${mem.pct}"></span></span>
      <span class="dbg-stat-pct">${mem.pct}</span>
    </div>`;
  } else {
    html += `<div class="dbg-stat-row"><span class="dbg-stat-label">Memory</span><span class="dbg-stat-val">not available (non-Chrome)</span></div>`;
  }
  if (audio) {
    html += `<div class="dbg-stat-row">
      <span class="dbg-stat-label">AudioContext</span>
      <span class="dbg-stat-val">${audio.state} · ${audio.sampleRate} · latency ${audio.latency} · t=${audio.currentTime}</span>
    </div>`;
  }
  statsEl.innerHTML = html;
}

function buildPanel() {
  panel = document.createElement('div');
  panel.id = 'dbg-panel';
  panel.innerHTML = `
    <div id="dbg-header">
      <span id="dbg-title">DEBUG</span>
      <button id="dbg-clear">Clear</button>
      <button id="dbg-close">✕</button>
    </div>
    <div id="dbg-stats"></div>
    <div id="dbg-divider">── Events ──────────────────────────</div>
    <div id="dbg-events"></div>
  `;
  document.body.appendChild(panel);

  panel.querySelector('#dbg-close').addEventListener('click', hide);
  panel.querySelector('#dbg-clear').addEventListener('click', () => { events.length = 0; renderEvents(); });
}

export function show() {
  if (!panel) buildPanel();
  panel.style.display = 'flex';
  visible = true;
  renderEvents();
  updateStats();
  statsInterval = setInterval(() => { updateStats(); renderEvents(); }, 1000);
}

export function hide() {
  if (panel) panel.style.display = 'none';
  visible = false;
  clearInterval(statsInterval);
}

export function toggle() {
  visible ? hide() : show();
}

// intercept orbit logs from audio.js
export function patchConsole() {
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origLog   = console.log.bind(console);

  console.log = (...args) => {
    origLog(...args);
    const msg = args[0];
    if (typeof msg === 'string' && msg.startsWith('[orbit]')) {
      const rest = args.slice(1);
      dbgLog('orbit', msg.replace('[orbit] ', ''), rest.length ? rest : null);
    }
  };
  console.warn = (...args) => {
    origWarn(...args);
    const msg = String(args[0]);
    if (msg.startsWith('[orbit]')) dbgLog('warn', msg.replace('[orbit] ', ''), args[1] ?? null);
  };
  console.error = (...args) => {
    origError(...args);
    const msg = String(args[0]);
    if (msg.startsWith('[orbit]')) dbgLog('error', msg.replace('[orbit] ', ''), args[1] ?? null);
    else dbgLog('error', args.map(String).join(' '));
  };
}
