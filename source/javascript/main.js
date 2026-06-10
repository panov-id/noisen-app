// ── Entry point — wires all modules together ──────────────────

import {
  state, APP_VERSION, TYPES, TYPE_DEFAULTS, WORLD_WIDTH, TOP_H,
  saveSettings, loadSettings,
} from './store.js';

import {
  freqFromX, filterFromNorm, nodeFreq, nodeRadius, effectivePan,
  toneHz, locutHz, hicutHz,
  createAudio, destroyAudio, updateAudio, rebuildAudio,
  startAll, stopAll,
  syncOrbitLFO, createOrbitLFOs,
  masterGain, masterFilter, masterReverb, masterDelay, locut, hiCut,
  masterRecorder,
} from './audio.js';

import {
  canvas, context,
  screenToWorld, worldToScreen, applyZoom, computeFilterNorm,
  hitTest, spawnRipple, rippleInterval,
  drawNodeWaves, drawLinks, drawRipples, drawNode, drawOrbits,
  drawGrid, drawViewIndicator,
  drawSpectrum, resizeSpectrumCanvas,
  setFrameBudget,
} from './canvas.js';

import {
  fmtHz, fmtPan, setSliderPct, showToast,
  applyTheme, applyGlobal,
  selectNode, deselectNode, buildNodeCards, buildTypeButtons, updateNodeInfoStrip,
  updateAnalytics,
  showTooltip, hideTooltip,
  showWhatsNew,
  initWizard, wizardOpen, wizardClose,
  openNodesOverlay, closeNodesOverlay,
  initFxOverlay,
  captureState, decodePreset, registerApplyPreset,
  openPresetsOverlay, closePresetsOverlay, initPresetsOverlay,
} from './ui.js';

// ── Canvas resize ─────────────────────────────────────────────
function resize() {
  const viewportWidth  = window.visualViewport?.width  ?? innerWidth;
  const viewportHeight = window.visualViewport?.height ?? innerHeight;
  canvas.width  = viewportWidth;
  canvas.height = viewportHeight;
  state.panelHeight = document.getElementById('bottom').offsetHeight || 240;
}
resize();
addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
// iOS: orientationchange fires before dimensions update — wait one frame
addEventListener('orientationchange', () => setTimeout(resize, 150));

function updatePanelH() {
  state.panelHeight = document.getElementById('bottom').offsetHeight || 240;
}

// ── Node management ───────────────────────────────────────────
function syncCount() {
  document.getElementById('an-nodes').textContent = state.nodes.length;
}

function addNode(worldX, worldY, filterNorm = 0.5) {
  const node = {
    id: ++state.nodeSeq, x: worldX, y: worldY, filterNorm,
    type: 'sine', muted: false, volume: .55, panOverride: null,
    attack: 0.3, decay: 0.1, sustain: 100, release: 0.8,
    reverbSend: 0, delaySend: 0, nodeDelayTime: 250, nodeDelayFeedback: 0, nodeDelayWet: 0,
    typeParams: { ...TYPE_DEFAULTS.sine },
    pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, audio: null,
  };
  state.nodes.push(node);
  createAudio(node);
  syncCount();
}

function removeNode(node) {
  if (state.selectedNode === node) deselectNode();
  destroyAudio(node);
  state.nodes = state.nodes.filter(n => n !== node);
  syncCount();
}

// ── Preset apply (cross-module) ───────────────────────────────
function applyPreset(preset) {
  for (const node of [...state.nodes]) removeNode(node);
  state.nodeSeq = 0;
  applyGlobal(preset.global);
  for (const nd of preset.nodes) {
    const node = {
      id: ++state.nodeSeq, x: nd.x, y: nd.y,
      filterNorm: nd.filterNorm ?? 0.5,
      type: nd.type, muted: nd.muted, volume: nd.volume,
      panOverride: nd.panOverride,
      attack: nd.attack ?? 0.3, decay: nd.decay ?? 0.1, sustain: nd.sustain ?? 100, release: nd.release ?? 0.8,
      reverbSend: nd.reverbSend ?? 0, delaySend: nd.delaySend ?? 0,
      nodeDelayTime: nd.nodeDelayTime ?? 250, nodeDelayFeedback: nd.nodeDelayFeedback ?? 0, nodeDelayWet: nd.nodeDelayWet ?? 0,
      typeParams: { ...nd.typeParams },
      pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, audio: null,
    };
    state.nodes.push(node);
    createAudio(node);
  }
  syncCount();
  state.viewX = 0; state.viewY = 0; state.velX = 0; state.velY = 0; state.zoom = 1;
}

registerApplyPreset(applyPreset);

// ── Theme init ────────────────────────────────────────────────
const savedTheme = loadSettings().theme;
applyTheme(savedTheme ? savedTheme === 'dark' : true, false);
document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(!state.isDark));

// ── Large text ────────────────────────────────────────────────
state.largeText = loadSettings().largeText !== false;
document.documentElement.dataset.large = state.largeText ? '1' : '0';
document.getElementById('large-toggle').classList.toggle('active', state.largeText);
document.getElementById('large-toggle').addEventListener('click', () => {
  state.largeText = !state.largeText;
  document.documentElement.dataset.large = state.largeText ? '1' : '0';
  document.getElementById('large-toggle').classList.toggle('active', state.largeText);
  saveSettings({ largeText: state.largeText });
});

// ── Version badge ─────────────────────────────────────────────
document.getElementById('version-btn').textContent = `v${APP_VERSION}`;
document.getElementById('version-btn').addEventListener('click', () => showWhatsNew(APP_VERSION));

// auto-show whats-new on first load with this version
(function checkVersion() {
  const seen = loadSettings().lastSeenVersion;
  if (seen !== APP_VERSION) {
    setTimeout(() => showWhatsNew(APP_VERSION), 600);
  }
})();

document.getElementById('whatsnew-close-btn').addEventListener('click', () => {
  document.getElementById('whatsnew-overlay').classList.remove('open');
  saveSettings({ lastSeenVersion: APP_VERSION });
});

// ── Restore saved settings ────────────────────────────────────
(function restoreSettings() {
  const s = loadSettings();
  const vol    = s.vol    ?? 70;
  const grav   = s.grav   ?? 50;
  const tone   = s.tone   ?? 60;
  const spread = s.spread ?? 40;
  if (s.vol !== undefined || s.grav !== undefined || s.tone !== undefined || s.spread !== undefined) {
    applyGlobal({ vol, grav, tone, spread });
  }
})();

// ── Global sliders ────────────────────────────────────────────
document.getElementById('vol').addEventListener('input', e => {
  const v = e.target.valueAsNumber;
  state.masterVolume = v / 100;
  masterGain.gain.rampTo(state.masterVolume, .05);
  document.getElementById('gv-vol-val').textContent = `${v}%`;
  setSliderPct(e.target, v, 0, 100);
  saveSettings({ vol: v });
});
document.getElementById('grav').addEventListener('input', e => {
  const v = e.target.valueAsNumber;
  state.gravityStrength = v / 100;
  document.getElementById('gv-grav-val').textContent = `${v}%`;
  document.getElementById('an-grav').textContent = `${v}%`;
  setSliderPct(e.target, v, 0, 100);
  saveSettings({ grav: v });
});
document.getElementById('tone').addEventListener('input', e => {
  const v = e.target.valueAsNumber;
  state.masterTone = v / 100;
  masterFilter.frequency.rampTo(toneHz(state.masterTone), .1);
  document.getElementById('gv-tone-val').textContent = `${v}%`;
  setSliderPct(e.target, v, 0, 100);
  saveSettings({ tone: v });
});
document.getElementById('spread').addEventListener('input', e => {
  const v = e.target.valueAsNumber;
  state.waveSpread = v / 100;
  document.getElementById('gv-spread-val').textContent = `${v}%`;
  setSliderPct(e.target, v, 0, 100);
  saveSettings({ spread: v });
});

// ── Reset view ────────────────────────────────────────────────
document.getElementById('reset-view').addEventListener('click', () => {
  let startX = state.viewX, startY = state.viewY, t = 0;
  state.velX = 0; state.velY = 0;
  function animate() {
    t += 0.08;
    const ease = 1 - Math.pow(1 - Math.min(t, 1), 3);
    state.viewX = startX * (1 - ease);
    state.viewY = startY * (1 - ease);
    if (t < 1) requestAnimationFrame(animate);
    else { state.viewX = 0; state.viewY = 0; }
  }
  requestAnimationFrame(animate);
});

// ── Nodes overview ────────────────────────────────────────────
document.getElementById('nodes-overview-btn').addEventListener('click', openNodesOverlay);
document.getElementById('nodes-overlay-close').addEventListener('click', closeNodesOverlay);
document.getElementById('nodes-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeNodesOverlay();
});

// ── FX overlay ────────────────────────────────────────────────
initFxOverlay();
document.getElementById('fx-btn').addEventListener('click', () => {
  document.getElementById('fx-overlay').classList.toggle('open');
});
document.getElementById('fx-overlay-close').addEventListener('click', () => {
  document.getElementById('fx-overlay').classList.remove('open');
});
document.getElementById('fx-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('fx-overlay').classList.remove('open');
});

// ── Presets ───────────────────────────────────────────────────
initPresetsOverlay();

// auto-load from URL ?p=
(function loadFromUrl() {
  const params  = new URLSearchParams(location.search);
  const encoded = params.get('p');
  if (!encoded) return;
  try {
    const preset = decodePreset(encoded);
    setTimeout(() => applyPreset(preset), 80);
  } catch (err) {
    console.warn('Failed to decode preset from URL', err);
  }
})();

// ── Wizard ────────────────────────────────────────────────────
initWizard();

// ── Hamburger menu ────────────────────────────────────────────
const hamburgerBtn      = document.getElementById('hamburger-btn');
const hamburgerDropdown = document.getElementById('topbar-dropdown');
hamburgerBtn.addEventListener('click', e => {
  e.stopPropagation();
  hamburgerDropdown.classList.toggle('open');
  hamburgerBtn.classList.toggle('active', hamburgerDropdown.classList.contains('open'));
});
document.addEventListener('pointerdown', e => {
  if (!hamburgerDropdown.contains(e.target) && e.target !== hamburgerBtn) {
    hamburgerDropdown.classList.remove('open');
    hamburgerBtn.classList.remove('active');
  }
});

// mirror mobile dropdown buttons to their desktop counterparts
function mirrorBtn(mobileId, desktopId, fn) {
  const btn = document.getElementById(mobileId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    hamburgerDropdown.classList.remove('open');
    hamburgerBtn.classList.remove('active');
    if (desktopId) document.getElementById(desktopId)?.click();
    else fn?.();
  });
}
mirrorBtn('theme-toggle-m',       'theme-toggle');
mirrorBtn('random-btn-m',         'random-btn');
mirrorBtn('presets-btn-m',        'presets-btn');
mirrorBtn('nodes-overview-btn-m', 'nodes-overview-btn');
mirrorBtn('reset-view-m',         'reset-view');
mirrorBtn('large-toggle-m',       'large-toggle');
mirrorBtn('fx-btn-m',             'fx-btn');
mirrorBtn('version-btn-m',        null, () => showWhatsNew(APP_VERSION));
mirrorBtn('help-btn-m',           'help-btn');

// node-cards collapse toggle (mobile)
const nodeCardsToggle = document.getElementById('node-cards-toggle');
const nodeViewEl      = document.getElementById('node-view');
nodeCardsToggle.addEventListener('click', () => {
  const collapsed = nodeViewEl.classList.toggle('cards-collapsed');
  nodeCardsToggle.classList.toggle('collapsed', collapsed);
  updatePanelH();
});

// ── Tooltip ───────────────────────────────────────────────────
document.addEventListener('pointerover',  e => { const el = e.target.closest('[data-tip]'); if (el) showTooltip(el); else hideTooltip(); });
document.addEventListener('pointerleave', hideTooltip);
document.addEventListener('pointerdown',  hideTooltip);

// ── Node action buttons ───────────────────────────────────────
document.getElementById('act-mute').addEventListener('click', () => {
  if (!state.selectedNode) return;
  state.selectedNode.muted = !state.selectedNode.muted;
  updateAudio(state.selectedNode);
  const btn = document.getElementById('act-mute');
  btn.classList.toggle('muted', state.selectedNode.muted);
  btn.dataset.tip = state.selectedNode.muted ? 'Unmute' : 'Mute';
});
document.getElementById('act-delete').addEventListener('click', () => {
  if (!state.selectedNode) return;
  removeNode(state.selectedNode);
  deselectNode();
});
document.getElementById('node-close').addEventListener('click', deselectNode);

// ── Play / Stop ───────────────────────────────────────────────
const playBtn = document.getElementById('play-btn');

// Silent audio loop — anchors OS audio session so Web Audio continues when screen locks
const keepAlive = new Audio();
keepAlive.src  = 'silence.mp3';
keepAlive.loop = true;

function setupMediaSession(playing) {
  if (!('mediaSession' in navigator)) return;
  if (!navigator.mediaSession.metadata) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Noisen', artist: 'noisen.space',
      artwork: [
        { src: base + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: base + 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.setActionHandler('play',  () => { if (!state.isPlaying) playBtn.click(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (state.isPlaying)  playBtn.click(); });
    navigator.mediaSession.setActionHandler('stop',  () => { if (state.isPlaying)  playBtn.click(); });
  }
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

document.addEventListener('visibilitychange', () => {
  if (state.isPlaying) Tone.context.resume();
});

playBtn.addEventListener('click', async () => {
  await Tone.start();
  state.isPlaying = !state.isPlaying;
  document.getElementById('pi-play').style.display = state.isPlaying ? 'none' : '';
  document.getElementById('pi-stop').style.display = state.isPlaying ? ''     : 'none';
  playBtn.classList.toggle('on', state.isPlaying);
  if (state.isPlaying) {
    keepAlive.play().catch(() => {});
    startAll();
  } else {
    keepAlive.pause();
    stopAll();
  }
  setupMediaSession(state.isPlaying);
});

// ── Recording ─────────────────────────────────────────────────
let isRecording   = false;
let recInterval   = null;
let recStartTime  = 0;
const recBtn      = document.getElementById('rec-btn');
const recTimerEl  = document.getElementById('rec-timer');

function fmtRecTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

recBtn.addEventListener('click', async () => {
  if (isRecording) {
    isRecording = false;
    recBtn.classList.remove('recording');
    recTimerEl.style.display = 'none';
    clearInterval(recInterval);
    const blob = await masterRecorder.stop();
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `noisen-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    if (!state.isPlaying) { showToast('Start playback first'); return; }
    await masterRecorder.start();
    isRecording         = true;
    recStartTime        = Date.now();
    recBtn.classList.add('recording');
    recTimerEl.style.display = '';
    recTimerEl.textContent   = '00:00';
    recInterval = setInterval(() => {
      recTimerEl.textContent = fmtRecTime(Date.now() - recStartTime);
    }, 500);
  }
});

// ── PWA install prompt ────────────────────────────────────────
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('pwa-btn').style.display = 'flex';
});
document.getElementById('pwa-btn').addEventListener('click', () => {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; }
});

// ── Random harmonic preset ────────────────────────────────────
const SCALES = {
  'Major':            [0, 2, 4, 5, 7, 9, 11],
  'Minor':            [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic':       [0, 2, 4, 7, 9],
  'Minor pentatonic': [0, 3, 5, 7, 10],
  'Dorian':           [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian':       [0, 2, 4, 5, 7, 9, 10],
  'Lydian':           [0, 2, 4, 6, 7, 9, 11],
  'Phrygian':         [0, 1, 3, 5, 7, 8, 10],
};
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function semitoneToFreq(semitone) { return 440 * Math.pow(2, (semitone - 57) / 12); }
function freqToWorldX(freq)       { return Math.log2(Math.max(8, freq) / 8) / 12.3 * WORLD_WIDTH; }

function generateHarmonicPreset() {
  for (const node of [...state.nodes]) removeNode(node);
  state.nodeSeq = 0;

  const scaleNames = Object.keys(SCALES);
  const scaleName  = scaleNames[Math.floor(Math.random() * scaleNames.length)];
  const scale      = SCALES[scaleName];
  const rootNote   = Math.floor(Math.random() * 12);
  const rootOctave = 3 + Math.floor(Math.random() * 2);
  const rootBase   = rootOctave * 12 + rootNote;

  const count = 3 + Math.floor(Math.random() * 4);
  const pool  = [];
  for (let oct = 0; oct <= 1; oct++)
    for (const step of scale) pool.push(rootBase + step + oct * 12);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, count);

  const canvasArea = canvas.height - state.panelHeight - TOP_H;
  const typePool   = ['sine','sine','sine','triangle','triangle','square'];

  for (const semitone of chosen) {
    const freq       = semitoneToFreq(semitone);
    const worldX     = freqToWorldX(freq);
    const filterNorm = 0.10 + Math.random() * 0.50;
    const worldY     = TOP_H + canvasArea * filterNorm;
    const type       = typePool[Math.floor(Math.random() * typePool.length)];
    const volume     = 0.35 + Math.random() * 0.30;
    const typeParams = { ...TYPE_DEFAULTS[type], detune: (Math.random() - 0.5) * 16 };

    const node = {
      id: ++state.nodeSeq, x: worldX, y: worldY, filterNorm,
      type, muted: false, volume, panOverride: null,
      typeParams,
      attack: 0.3, decay: 0.1, sustain: 100, release: 0.8,
      reverbSend: 0, delaySend: 0, nodeDelayTime: 250, nodeDelayFeedback: 0, nodeDelayWet: 0,
      pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, audio: null,
    };
    state.nodes.push(node);
    createAudio(node);
  }
  syncCount();

  applyGlobal({
    vol:    65 + Math.floor(Math.random() * 15),
    grav:   20 + Math.floor(Math.random() * 20),
    tone:   60 + Math.floor(Math.random() * 25),
    spread: 30 + Math.floor(Math.random() * 30),
  });

  state.viewX = 0; state.viewY = 0; state.velX = 0; state.velY = 0; state.zoom = 1;

  const rootName  = NOTE_NAMES[rootNote] + rootOctave;
  showToast(`${rootName} ${scaleName} — ${count} nodes`);

  const nameInput = document.getElementById('preset-name-input');
  if (nameInput) nameInput.value = `${rootName} ${scaleName}`;
}

document.getElementById('random-btn').addEventListener('click', generateHarmonicPreset);

// ── Pointer interaction ───────────────────────────────────────
let dragNode          = null;
let dragStartClientX  = 0, dragStartClientY  = 0;
let dragStartNodeX    = 0, dragStartNodeY    = 0;
let pDown = 0, pNode = null, didDrag = false;
let panStartViewX = 0, panStartViewY = 0;
let panStartClientX = 0, panStartClientY = 0;
let isPanning = false;
let lastMoveX = 0, lastMoveY = 0, lastMoveTime = 0;

const activePointers = new Map();
let isPinching       = false;
let pinchStartDist   = 0, pinchStartZoom = 1;
let pinchMidX = 0, pinchMidY = 0;

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) selectNode(hit);
});

canvas.addEventListener('pointerdown', e => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    const pts = [...activePointers.values()];
    pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    pinchStartZoom = state.zoom;
    pinchMidX = (pts[0].x + pts[1].x) / 2;
    pinchMidY = (pts[0].y + pts[1].y) / 2;
    isPinching = true; isPanning = false; dragNode = null;
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button === 2) return;
  if (e.clientY < TOP_H || e.clientY > canvas.height - state.panelHeight) return;

  const hit = hitTest(e.clientX, e.clientY);
  if (state.selectedNode && !hit)              { deselectNode(); return; }
  if (state.selectedNode && hit && hit !== state.selectedNode) { selectNode(hit); return; }

  pDown = Date.now(); didDrag = false; state.velX = 0; state.velY = 0;
  if (hit) {
    dragNode = hit; pNode = hit;
    dragStartClientX = e.clientX; dragStartClientY = e.clientY;
    dragStartNodeX   = hit.x;    dragStartNodeY    = hit.y;
  } else {
    isPanning = true; pNode = null;
    panStartViewX  = state.viewX; panStartViewY  = state.viewY;
    panStartClientX = e.clientX;  panStartClientY = e.clientY;
    lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveTime = Date.now();
  }
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = hit ? 'grab' : 'grabbing';
});

canvas.addEventListener('pointermove', e => {
  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (isPinching && activePointers.size === 2) {
    const pts  = [...activePointers.values()];
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    applyZoom(pinchStartZoom * dist / pinchStartDist, pinchMidX, pinchMidY);
    return;
  }
  if (dragNode) {
    const dx = e.clientX - dragStartClientX, dy = e.clientY - dragStartClientY;
    if (Math.hypot(dx, dy) > 4) didDrag = true;
    dragNode.x          = dragStartNodeX + dx / state.zoom;
    dragNode.y          = dragStartNodeY + dy / state.zoom;
    dragNode.filterNorm = computeFilterNorm(e.clientY);
    updateAudio(dragNode);
  } else if (isPanning) {
    const dx = e.clientX - panStartClientX, dy = e.clientY - panStartClientY;
    if (Math.hypot(dx, dy) > 4) didDrag = true;
    state.viewX = panStartViewX - dx / state.zoom;
    state.viewY = panStartViewY - dy / state.zoom;
    const now = Date.now(), dt = Math.max(1, now - lastMoveTime);
    state.velX = (lastMoveX - e.clientX) / dt * 16 / state.zoom;
    state.velY = (lastMoveY - e.clientY) / dt * 16 / state.zoom;
    lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveTime = now;
  }
});

canvas.addEventListener('pointerup', e => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) isPinching = false;
  const dt = Date.now() - pDown;
  if (dragNode) {
    // node position already updated during move
  } else if (isPanning) {
    if (!didDrag && dt < 350 && e.clientY > TOP_H && e.clientY < canvas.height - state.panelHeight) {
      const world = screenToWorld(e.clientX, e.clientY);
      addNode(world.x, world.y, computeFilterNorm(e.clientY));
    }
  }
  if (pNode && !didDrag && dt < 400) selectNode(pNode);
  dragNode = null; pNode = null; didDrag = false; isPanning = false;
  canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  applyZoom(state.zoom * factor, e.clientX, e.clientY);
}, { passive: false });

// ── Spectrum canvas resize ────────────────────────────────────
resizeSpectrumCanvas();
addEventListener('resize', resizeSpectrumCanvas);

// ── Main animation loop ───────────────────────────────────────
let lastSlow  = 0;
let lastFrame = 0;
let frameBudgetMs = 33;
const FRAME_TARGET_MS = 33; // ~30fps

function loop(time = 0) {
  requestAnimationFrame(loop);

  const elapsed = time - lastFrame;
  if (elapsed < FRAME_TARGET_MS) return;
  frameBudgetMs = frameBudgetMs * 0.9 + elapsed * 0.1;
  setFrameBudget(frameBudgetMs);
  lastFrame = time;

  // momentum pan
  if (!isPanning && !dragNode && (Math.abs(state.velX) > 0.3 || Math.abs(state.velY) > 0.3)) {
    state.viewX += state.velX;
    state.viewY += state.velY;
    state.velX  *= 0.88;
    state.velY  *= 0.88;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  context.save();
  context.scale(state.zoom, state.zoom);
  context.translate(-state.viewX, -state.viewY);
  for (const node of state.nodes) if (!node.muted) drawNodeWaves(node, time);
  drawLinks();
  drawRipples();
  for (const node of state.nodes) drawOrbits(node, time);
  for (const node of state.nodes) drawNode(node, time);
  context.restore();

  drawViewIndicator();

  if (state.isPlaying) {
    for (const node of state.nodes) {
      if (node.muted) continue;
      node.rippleTimer++;
      if (node.rippleTimer >= rippleInterval(node)) {
        node.rippleTimer = 0;
        spawnRipple(node);
      }
    }
  }

  if (time - lastSlow > 100) {
    for (const node of state.nodes) updateAudio(node);
    if (state.selectedNode) updateNodeInfoStrip(state.selectedNode);
    updateAnalytics();
    drawSpectrum();
    lastSlow = time;
  }
}

loop();

// ── Service worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
