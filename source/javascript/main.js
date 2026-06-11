// ── Entry point — wires all modules together ──────────────────

import {
  state, APP_VERSION, TYPES, TYPE_DEFAULTS, DRUM_TYPES, WORLD_WIDTH, WORLD_HEIGHT, TOP_H,
  saveSettings, loadSettings,
} from './store.js';

import {
  freqFromX, filterFromNorm, nodeFreq, nodeRadius, effectivePan,
  toneHz, locutHz, hicutHz,
  createAudio, destroyAudio, updateAudio, rebuildAudio,
  startAll, stopAll, startBeat, stopBeat, triggerDrumNode,
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

import { toggle as toggleDebug, patchConsole as patchDebugConsole } from './debug.js';
import { resolveShortCode, showShareModal } from './links.js';
// expose showShareModal globally so ui.js can call it without circular import
window.__showShareModal = showShareModal;
import { trackPresetGenerated, trackPlayToggled, trackNodeCreated } from './analytics.js';

// ── Short link resolution on load ─────────────────────────────
(async () => {
  const params = new URLSearchParams(location.search);
  const shortCode = params.get('s');
  if (!shortCode) return;
  try {
    const longUrl = await resolveShortCode(shortCode);
    if (!longUrl) return;
    // replace URL in browser without reload
    const resolved = new URL(longUrl, location.origin);
    const preset = resolved.searchParams.get('preset');
    if (preset) {
      history.replaceState(null, '', `?preset=${encodeURIComponent(preset)}`);
    }
  } catch {}
})();

// ── Debug panel ───────────────────────────────────────────────
patchDebugConsole();
document.addEventListener('keydown', e => {
  if (e.shiftKey && e.key === 'D') toggleDebug();
});
document.getElementById('debug-btn').addEventListener('click', toggleDebug);

// ── Fullscreen ────────────────────────────────────────────────
const fullscreenBtn  = document.getElementById('fullscreen-btn');
const fsExpandIcon   = document.getElementById('fs-expand');
const fsCompressIcon = document.getElementById('fs-compress');

function updateFullscreenIcon() {
  const active = !!document.fullscreenElement;
  fsExpandIcon.style.display   = active ? 'none'  : '';
  fsCompressIcon.style.display = active ? ''      : 'none';
}

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreenIcon);

// ── Canvas resize ─────────────────────────────────────────────
function resize() {
  const viewportWidth  = window.visualViewport?.width  ?? innerWidth;
  const viewportHeight = window.visualViewport?.height ?? innerHeight;
  canvas.width  = viewportWidth;
  canvas.height = viewportHeight;
  state.panelHeight = document.getElementById('bottom').offsetHeight || 240;
  // Re-sync node Y from filterNorm (canonical) so audio is screen-size independent.
  // filterNorm is the source of truth; Y is derived from it against current canvas.
  const canvasArea = canvas.height - state.panelHeight - TOP_H;
  for (const node of state.nodes) {
    if (node.filterNorm != null) {
      node.y = TOP_H + node.filterNorm * canvasArea;
    }
  }
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
  if (state.beatMode) {
    const drumType = selectedDrumType;
    const node = {
      id: ++state.nodeSeq, x: worldX, y: worldY, filterNorm,
      type: drumType, muted: false, volume: .7, panOverride: null,
      typeParams: { ...TYPE_DEFAULTS[drumType] },
      steps: Array(16).fill(false),
      orbits: [],
      pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, _rippleNext: 20 + Math.random() * 60, audio: null,
    };
    state.nodes.push(node);
    syncCount();
    selectNode(node);
    return;
  }
  const node = {
    id: ++state.nodeSeq, x: worldX, y: worldY, filterNorm,
    type: 'sine', muted: false, volume: .55, panOverride: null,
    attack: 0.3, decay: 0.1, sustain: 100, release: 0.8,
    reverbSend: 0, delaySend: 0, nodeDelayTime: 250, nodeDelayFeedback: 0, nodeDelayWet: 0,
    typeParams: { ...TYPE_DEFAULTS.sine },
    orbits: [],
    pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, _rippleNext: 20 + Math.random() * 60, audio: null,
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
      panOverride: nd.panOverride ?? null,
      attack: nd.attack ?? 0.3, decay: nd.decay ?? 0.1, sustain: nd.sustain ?? 100, release: nd.release ?? 0.8,
      reverbSend: nd.reverbSend ?? 0, delaySend: nd.delaySend ?? 0,
      nodeDelayTime: nd.nodeDelayTime ?? 250, nodeDelayFeedback: nd.nodeDelayFeedback ?? 0, nodeDelayWet: nd.nodeDelayWet ?? 0,
      typeParams: { ...nd.typeParams },
      steps: nd.steps ? [...nd.steps] : undefined,
      orbits: nd.orbits ? [...nd.orbits] : [],
      pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, _rippleNext: 20 + Math.random() * 60, audio: null,
    };
    state.nodes.push(node);
    if (!DRUM_TYPES.has(node.type)) createAudio(node);
  }
  syncCount();
  fitAllNodes();
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
function fitAllNodes() {
  state.velX = 0; state.velY = 0;
  if (state.nodes.length === 0) {
    state.viewX = 0; state.viewY = 0; state.zoom = 1;
    return;
  }
  const pad = 80;
  const minX = Math.min(...state.nodes.map(n => n.x)) - pad;
  const maxX = Math.max(...state.nodes.map(n => n.x)) + pad;
  const minY = Math.min(...state.nodes.map(n => n.y)) - pad;
  const maxY = Math.max(...state.nodes.map(n => n.y)) + pad;
  const viewW = canvas.width;
  const viewH = canvas.height - state.panelHeight;
  const newZoom = Math.max(0.25, Math.min(2, Math.min(viewW / (maxX - minX), viewH / (maxY - minY))));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  state.zoom = newZoom;
  state.viewX = centerX - viewW / (2 * newZoom);
  state.viewY = centerY - viewH / (2 * newZoom);
}

document.getElementById('reset-view').addEventListener('click', fitAllNodes);

// ── Nodes overview ────────────────────────────────────────────
document.getElementById('nodes-overview-btn').addEventListener('click', openNodesOverlay);
document.getElementById('nodes-overlay-close').addEventListener('click', closeNodesOverlay);
document.getElementById('nodes-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeNodesOverlay();
});

// ── FX view ───────────────────────────────────────────────────
initFxOverlay();
document.getElementById('fx-btn').addEventListener('click', () => {
  if (document.getElementById('fx-view').classList.contains('active')) {
    showView('global');
  } else {
    deselectNode();
    showView('fx');
  }
});
document.getElementById('fx-view-close').addEventListener('click', () => {
  showView('global');
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
mirrorBtn('fullscreen-btn-m',     'fullscreen-btn');
mirrorBtn('debug-btn-m',          'debug-btn');
mirrorBtn('version-btn-m',        null, () => showWhatsNew(APP_VERSION));
mirrorBtn('help-btn-m',           'help-btn');
mirrorBtn('beat-mode-btn-m',      'beat-mode-btn');
mirrorBtn('rec-btn-m',            'rec-btn');
mirrorBtn('comet-btn-m',          'comet-btn');

document.getElementById('comet-btn').addEventListener('click', openCometPanel);

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

// ── Comet panel ───────────────────────────────────────────────
let selectedCometId = null;

function getSelectedComet() {
  return state.comets.find(c => c.id === selectedCometId) ?? null;
}

function openCometPanel() {
  if (state.selectedNode) deselectNode();
  showView('comet');
  renderCometList();
  // auto-select most recent comet if any
  const last = state.comets[state.comets.length - 1];
  if (last) { selectedCometId = last.id; renderCometParams(last); renderCometList(); }
  else { selectedCometId = null; renderCometParamsEmpty(); }
}

function selectComet(comet) {
  if (state.selectedNode) deselectNode();
  selectedCometId = comet.id;
  showView('comet');
  renderCometList();
  renderCometParams(comet);
}

function deselectComet() {
  selectedCometId = null;
  showView('global');
}

function renderCometParamsEmpty() {
  document.getElementById('comet-params').style.opacity = '0.35';
}

function showView(name) {
  document.getElementById('global-view').classList.toggle('active',  name === 'global');
  document.getElementById('node-view').classList.toggle('active',    name === 'node');
  document.getElementById('comet-view').classList.toggle('active',   name === 'comet');
  document.getElementById('fx-view').classList.toggle('active',      name === 'fx');
  document.getElementById('comet-btn').classList.toggle('on', name === 'comet');
  document.getElementById('fx-btn').classList.toggle('on',    name === 'fx');
}

function renderCometList() {
  const list = document.getElementById('comet-list');
  const existingIds = [...list.querySelectorAll('.comet-chip')].map(el => el.dataset.cometId);
  const currentIds  = state.comets.map(c => String(c.id));

  // rebuild only when the set of comets changed
  if (existingIds.join(',') !== currentIds.join(',')) {
    list.innerHTML = '';
    state.comets.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'comet-chip';
      chip.dataset.cometId = c.id;
      chip.innerHTML = `<span class="comet-chip-dot" style="background:${c.color}"></span>Comet`;
      chip.addEventListener('click', () => {
        selectedCometId = c.id;
        updateCometChipSelection();
        renderCometParams(c);
      });
      list.appendChild(chip);
    });
  }

  updateCometChipSelection();
}

function updateCometChipSelection() {
  document.querySelectorAll('#comet-list .comet-chip').forEach(el => {
    el.classList.toggle('selected', el.dataset.cometId === String(selectedCometId));
  });
}

function renderCometParams(comet) {
  document.getElementById('comet-params').style.opacity = '';
  const orbitSlider  = document.getElementById('cp-orbit');
  const speedSlider  = document.getElementById('cp-speed');
  const gravSlider   = document.getElementById('cp-gravity');
  const lifeSlider   = document.getElementById('cp-life');

  // orbit relative to spawn rx
  const orbitVal = Math.round((comet.rx / comet._baseRx) * 100);
  orbitSlider.value = orbitVal;
  document.getElementById('cp-orbit-val').textContent = `${(orbitVal / 100).toFixed(1)}×`;
  setSliderPct(orbitSlider, orbitVal, 10, 400);

  // speed: map absolute speed to a 10–500 scale (100 = abs speed 0.02)
  const absSpeed = Math.abs(comet.speed);
  const speedVal = Math.round(absSpeed / 0.0002);
  speedSlider.value = Math.min(500, Math.max(10, speedVal));
  document.getElementById('cp-speed-val').textContent = `${(speedVal / 100).toFixed(1)}×`;
  setSliderPct(speedSlider, speedVal, 10, 500);

  // gravity relative to spawn mass
  const gravVal = Math.round((comet.mass / comet._baseMass) * 100);
  gravSlider.value = gravVal;
  document.getElementById('cp-gravity-val').textContent = `${(gravVal / 100).toFixed(1)}×`;
  setSliderPct(gravSlider, gravVal, 10, 400);

  // shape: ry/rx ratio as percent (10–100)
  const shapeVal = Math.round((comet.ry / comet.rx) * 100);
  document.getElementById('cp-shape').value = shapeVal;
  document.getElementById('cp-shape-val').textContent = `${shapeVal}%`;
  setSliderPct(document.getElementById('cp-shape'), shapeVal, 10, 100);

  // move center button
  document.getElementById('cp-move-btn').classList.remove('active');
  document.getElementById('cp-move-val').textContent = 'Tap';

  // fade speed
  const fadeVal = Math.round((comet.fadeSpeed ?? 1) * 100);
  document.getElementById('cp-fade').value = Math.min(500, Math.max(10, fadeVal));
  document.getElementById('cp-fade-val').textContent = `${(fadeVal / 100).toFixed(1)}×`;
  setSliderPct(document.getElementById('cp-fade'), fadeVal, 10, 500);

  // permanent toggle
  const isPerm = comet.permanent ?? false;
  document.getElementById('cp-perm').value = isPerm ? 1 : 0;
  document.getElementById('cp-perm-val').textContent = isPerm ? 'On' : 'Off';
  document.getElementById('cp-perm').style.setProperty('--pct', isPerm ? '100%' : '0%');
  document.getElementById('cp-fade').disabled = isPerm;
  document.getElementById('cp-life').disabled = true;

  updateCometLifeDisplay(comet);
}

function updateCometLifeDisplay(comet) {
  if (comet.permanent) {
    document.getElementById('cp-life-val').textContent = '∞';
    document.getElementById('cp-life').value = 100;
    setSliderPct(document.getElementById('cp-life'), 100, 0, 100);
  } else {
    const pct = Math.round((comet.life / comet.maxLife) * 100);
    document.getElementById('cp-life').value = pct;
    document.getElementById('cp-life-val').textContent = `${pct}%`;
    setSliderPct(document.getElementById('cp-life'), pct, 0, 100);
  }
}

['cp-orbit', 'cp-speed', 'cp-gravity', 'cp-shape', 'cp-fade', 'cp-perm'].forEach(id => {
  document.getElementById(id).addEventListener('input', e => {
    const comet = getSelectedComet();
    if (!comet) return;
    const v = e.target.valueAsNumber;
    if (id === 'cp-orbit') {
      comet.rx = comet._baseRx * (v / 100);
      comet.ry = comet.rx * 0.55;
      document.getElementById('cp-orbit-val').textContent = `${(v / 100).toFixed(1)}×`;
      setSliderPct(e.target, v, 10, 400);
    } else if (id === 'cp-speed') {
      const dir = comet.speed < 0 ? -1 : 1;
      comet.speed = dir * v * 0.0002;
      document.getElementById('cp-speed-val').textContent = `${(v / 100).toFixed(1)}×`;
      setSliderPct(e.target, v, 10, 500);
    } else if (id === 'cp-gravity') {
      comet.mass      = comet._baseMass      * (v / 100);
      comet.influence = comet._baseInfluence * (v / 100);
      document.getElementById('cp-gravity-val').textContent = `${(v / 100).toFixed(1)}×`;
      setSliderPct(e.target, v, 10, 400);
    } else if (id === 'cp-shape') {
      comet.ry = comet.rx * (v / 100);
      document.getElementById('cp-shape-val').textContent = `${v}%`;
      setSliderPct(e.target, v, 10, 100);
    } else if (id === 'cp-fade') {
      comet.fadeSpeed = v / 100;
      document.getElementById('cp-fade-val').textContent = `${(v / 100).toFixed(1)}×`;
      setSliderPct(e.target, v, 10, 500);
    } else if (id === 'cp-perm') {
      comet.permanent = v === 1;
      document.getElementById('cp-perm-val').textContent = comet.permanent ? 'On' : 'Off';
      e.target.style.setProperty('--pct', comet.permanent ? '100%' : '0%');
      document.getElementById('cp-fade').disabled = comet.permanent;
      if (comet.permanent) {
        document.getElementById('cp-life-val').textContent = '∞';
        setSliderPct(document.getElementById('cp-life'), 100, 0, 100);
      }
    }
  });
});

let cometMoveMode = false;

document.getElementById('cp-move-btn').addEventListener('click', () => {
  cometMoveMode = !cometMoveMode;
  const btn = document.getElementById('cp-move-btn');
  btn.classList.toggle('active', cometMoveMode);
  document.getElementById('cp-move-val').textContent = cometMoveMode ? 'Click canvas' : 'Tap';
});

document.getElementById('comet-add-btn').addEventListener('click', () => {
  spawnComet();
  const newest = state.comets[state.comets.length - 1];
  if (newest) selectComet(newest);
});
document.getElementById('comet-delete-btn').addEventListener('click', () => {
  const comet = getSelectedComet();
  if (!comet) return;
  const idx = state.comets.indexOf(comet);
  if (idx >= 0) state.comets.splice(idx, 1);
  // select adjacent comet or go empty
  const next = state.comets[Math.min(idx, state.comets.length - 1)];
  if (next) { selectedCometId = next.id; renderCometList(); renderCometParams(next); }
  else { selectedCometId = null; renderCometList(); renderCometParamsEmpty(); }
});
document.getElementById('comet-close-btn').addEventListener('click', deselectComet);

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
    if (state.beatMode) startBeat(state.bpm);
  } else {
    keepAlive.pause();
    stopAll();
    if (state.beatMode) stopBeat();
  }
  setupMediaSession(state.isPlaying);
});

// ── Beat mode ─────────────────────────────────────────────────
const beatModeBtn  = document.getElementById('beat-mode-btn');
const bpmControl   = document.getElementById('bpm-control');
const bpmDisplay   = document.getElementById('bpm-display');

function updateBpmDisplay() {
  bpmDisplay.textContent = `${state.bpm} BPM`;
  if (state.isPlaying && state.beatMode) Tone.Transport.bpm.value = state.bpm;
}

beatModeBtn.addEventListener('click', () => {
  state.beatMode = !state.beatMode;
  beatModeBtn.classList.toggle('on', state.beatMode);
  document.getElementById('beat-mode-btn-m')?.classList.toggle('on', state.beatMode);
  bpmControl.style.display = state.beatMode ? 'flex' : 'none';
  if (state.isPlaying) {
    if (state.beatMode) startBeat(state.bpm);
    else stopBeat();
  }
});

document.getElementById('bpm-dec').addEventListener('click', () => {
  state.bpm = Math.max(40, state.bpm - 1);
  updateBpmDisplay();
});
document.getElementById('bpm-inc').addEventListener('click', () => {
  state.bpm = Math.min(300, state.bpm + 1);
  updateBpmDisplay();
});

// last-placed drum type — updated when user selects a drum type in node panel
let selectedDrumType = 'kick';
window.__setSelectedDrumType = t => { selectedDrumType = t; };

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

// ── Preset archetypes ─────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function semitoneToFreq(semitone) { return 440 * Math.pow(2, (semitone - 57) / 12); }
function freqToWorldX(freq)       { return Math.log2(Math.max(8, freq) / 8) / 12.3 * WORLD_WIDTH; }
function freqToFilterNorm(freq) {
  // inverse of filterFromNorm: norm such that filterFromNorm(norm) ≈ freq
  return 1 - (Math.log10(Math.max(20, freq)) - 1.5) / 3.8;
}
function rnd(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndDir() { return Math.random() > 0.5 ? 1 : -1; }

// Drum-valid orbit targets — excludes attack/release which are no-ops for drums
const DRUM_ORBIT_IDS = ['volume', 'pan', 'filter', 'delay', 'reverb', 'delay-time'];

function rndDrumOrbits() {
  const count = Math.random() < 0.25 ? 0 : Math.random() < 0.55 ? 1 : Math.random() < 0.75 ? 2 : 3;
  const targets = [...DRUM_ORBIT_IDS].sort(() => Math.random() - 0.5).slice(0, count);
  return targets.map(target => ({
    target,
    rate:      parseFloat(rnd(0.03, 1.2).toFixed(2)),
    depth:     Math.round(rnd(20, 75)),
    direction: rndDir(),
    enabled:   true,
  }));
}

function makeNode(freq, { type = 'sine', volume = 0.5, filterFreq = null, pan = null, orbits = [], reverb = 0, delayWet = 0 } = {}) {
  const filterNorm = filterFreq != null
    ? Math.max(0.02, Math.min(0.98, freqToFilterNorm(filterFreq)))
    : Math.max(0.02, Math.min(0.98, rnd(0.12, 0.55)));
  const worldX = freqToWorldX(freq);
  // Use WORLD_HEIGHT (fixed) so node positions are screen-size independent (fix B-02).
  const worldY = TOP_H + WORLD_HEIGHT * filterNorm;
  const typeParams = { ...TYPE_DEFAULTS[type] };
  if ('detune' in typeParams) typeParams.detune = rnd(-8, 8);
  return {
    id: ++state.nodeSeq, x: worldX, y: worldY, filterNorm,
    type, muted: false, volume,
    panOverride: pan,
    typeParams,
    attack: 0.5, decay: 0.1, sustain: 100, release: 1.2,
    reverbSend: reverb, delaySend: 0,
    nodeDelayTime: 250, nodeDelayFeedback: 0, nodeDelayWet: delayWet,
    orbits,
    pulsePhase: Math.random() * Math.PI * 2, rippleTimer: 0, _rippleNext: 20 + Math.random() * 60, audio: null,
  };
}

// ── Archetype: binaural beats ─────────────────────────────────
// Two carriers offset by a beat frequency → brain entrainment effect.
// Beat ranges: delta 0.5-4Hz, theta 4-8Hz, alpha 8-14Hz, beta 14-30Hz.
const BINAURAL_BANDS = [
  { name: 'Delta', range: [0.5, 4],  carrier: [80, 140],  desc: 'deep sleep' },
  { name: 'Theta', range: [4,   8],  carrier: [140, 220], desc: 'meditation' },
  { name: 'Alpha', range: [8,   14], carrier: [200, 320], desc: 'relaxation' },
  { name: 'Beta',  range: [14,  30], carrier: [300, 500], desc: 'focus' },
];

function generateBinaural() {
  const band     = pick(BINAURAL_BANDS);
  const carrier  = rnd(...band.carrier);
  const beat     = rnd(...band.range);
  const nodes    = [];

  // left ear carrier — pure sine, no orbit (preserves beat accuracy)
  nodes.push(makeNode(carrier, {
    type: 'sine', volume: rnd(0.45, 0.60),
    filterFreq: carrier * 6,
    pan: -0.8,
  }));

  // right ear carrier offset by beat frequency
  nodes.push(makeNode(carrier + beat, {
    type: 'sine', volume: rnd(0.45, 0.60),
    filterFreq: carrier * 6,
    pan: 0.8,
  }));

  // optional sub-bass ground tone (root × 0.5)
  if (Math.random() > 0.4) {
    nodes.push(makeNode(carrier * 0.5, {
      type: 'triangle', volume: rnd(0.20, 0.35),
      filterFreq: carrier * 2,
      orbits: [{ target: 'volume', rate: rnd(0.05, 0.15), depth: 35, direction: rndDir(), enabled: true }],
    }));
  }

  // pink noise bed for masking
  nodes.push(makeNode(rnd(300, 800), {
    type: 'noise', volume: rnd(0.12, 0.22),
    filterFreq: rnd(400, 1200),
    orbits: [{ target: 'filter', rate: rnd(0.03, 0.08), depth: 30, direction: rndDir(), enabled: true }],
  }));

  return { nodes, label: `${band.name} binaural · ${beat.toFixed(1)}Hz beat · ${band.desc}`, name: `${band.name} ${beat.toFixed(1)}Hz` };
}

// ── Archetype: solfeggio frequencies ─────────────────────────
// Sacred frequencies used in sound healing practices.
const SOLFEGGIO = [174, 285, 396, 417, 528, 639, 741, 852, 963];

function generateSolfeggio() {
  const shuffle = [...SOLFEGGIO].sort(() => Math.random() - 0.5);
  const count   = 3 + Math.floor(Math.random() * 3);
  const freqs   = shuffle.slice(0, count);
  const types   = ['sine', 'sine', 'sine', 'triangle'];

  const nodes = freqs.map((freq, i) => {
    const isBase = i === 0;
    return makeNode(freq, {
      type: pick(types),
      volume: isBase ? rnd(0.50, 0.65) : rnd(0.28, 0.45),
      filterFreq: freq * rnd(4, 10),
      reverb: rnd(0.1, 0.3),
      orbits: [
        { target: 'filter', rate: rnd(0.04, 0.12), depth: isBase ? 25 : 40, direction: rndDir(), enabled: true },
        ...(i > 0 ? [{ target: 'volume', rate: rnd(0.06, 0.18), depth: 30, direction: rndDir(), enabled: true }] : []),
      ],
    });
  });

  const label = `Solfeggio · ${freqs.map(f => f + 'Hz').join(' · ')}`;
  return { nodes, label, name: `Solfeggio ${freqs[0]}Hz` };
}

// ── Archetype: harmonic series ────────────────────────────────
// Natural overtone series built on a fundamental — physically consonant.
const HARMONIC_FUNDAMENTALS = [40, 55, 65, 80, 110];

function generateHarmonicSeries() {
  const fundamental = pick(HARMONIC_FUNDAMENTALS);
  const partials    = [1, 2, 3, 4, 5, 6, 8];
  const count       = 4 + Math.floor(Math.random() * 3);
  const chosen      = partials.slice(0, count);

  const nodes = chosen.map((partial, i) => {
    const freq   = fundamental * partial;
    const volume = Math.max(0.12, rnd(0.55, 0.70) / (1 + i * 0.6));
    const orbs   = [];

    if (i === 0) {
      // fundamental: slow volume breath
      orbs.push({ target: 'volume', rate: rnd(0.04, 0.10), depth: 40, direction: rndDir(), enabled: true });
    } else if (i < 3) {
      // lower harmonics: slow filter sweep
      orbs.push({ target: 'filter', rate: rnd(0.05, 0.15), depth: 35, direction: rndDir(), enabled: true });
    } else {
      // upper harmonics: pan movement + optional filter
      orbs.push({ target: 'pan', rate: rnd(0.08, 0.25), depth: Math.floor(rnd(30, 60)), direction: rndDir(), enabled: true });
      if (i >= 4) orbs.push({ target: 'volume', rate: rnd(0.12, 0.30), depth: 45, direction: rndDir(), enabled: true });
    }

    return makeNode(freq, {
      type: i === 0 ? 'sine' : pick(['sine', 'sine', 'triangle']),
      volume,
      filterFreq: freq * rnd(3, 8),
      reverb: i === 0 ? 0 : rnd(0.05, 0.20),
      orbits: orbs,
    });
  });

  const label = `Harmonic series · ${fundamental}Hz × ${chosen.join('/')}`;
  return { nodes, label, name: `${fundamental}Hz harmonics` };
}

// ── Archetype: full-spectrum ambient ─────────────────────────
// Covers sub/bass/mid/presence/air bands simultaneously — rich texture.
function generateFullSpectrum() {
  const nodes = [];

  // deep sub: infrasonic grounding
  nodes.push(makeNode(rnd(18, 45), {
    type: 'sine', volume: rnd(0.50, 0.65),
    filterFreq: rnd(50, 150),
    orbits: [{ target: 'volume', rate: rnd(0.02, 0.07), depth: 55, direction: rndDir(), enabled: true }],
  }));

  // bass: warmth 80–300Hz
  nodes.push(makeNode(rnd(80, 300), {
    type: pick(['sine', 'triangle']), volume: rnd(0.30, 0.45),
    filterFreq: rnd(200, 700),
    orbits: [{ target: 'filter', rate: rnd(0.04, 0.12), depth: 40, direction: rndDir(), enabled: true }],
  }));

  // low-mid: body 300–1200Hz
  nodes.push(makeNode(rnd(300, 1200), {
    type: pick(['sine', 'triangle', 'square']), volume: rnd(0.20, 0.35),
    filterFreq: rnd(800, 3000),
    reverb: rnd(0.10, 0.25),
    orbits: [
      { target: 'filter', rate: rnd(0.07, 0.18), depth: 40, direction: rndDir(), enabled: true },
      { target: 'pan',    rate: rnd(0.04, 0.12), depth: Math.floor(rnd(20, 50)), direction: rndDir(), enabled: true },
    ],
  }));

  // presence: 2–6kHz
  nodes.push(makeNode(rnd(2000, 6000), {
    type: pick(['sine', 'triangle']), volume: rnd(0.12, 0.25),
    filterFreq: rnd(3000, 9000),
    reverb: rnd(0.20, 0.40),
    orbits: [
      { target: 'filter', rate: rnd(0.09, 0.22), depth: 50, direction: rndDir(), enabled: true },
      { target: 'pan',    rate: rnd(0.05, 0.14), depth: Math.floor(rnd(30, 65)), direction: rndDir(), enabled: true },
    ],
  }));

  // air: high shimmer 8–18kHz
  nodes.push(makeNode(rnd(8000, 18000), {
    type: 'noise', volume: rnd(0.05, 0.12),
    filterFreq: rnd(10000, 20000),
    reverb: rnd(0.30, 0.55),
    orbits: [
      { target: 'filter', rate: rnd(0.05, 0.15), depth: 60, direction: rndDir(), enabled: true },
      { target: 'pan',    rate: rnd(0.03, 0.09), depth: Math.floor(rnd(45, 75)), direction: rndDir(), enabled: true },
    ],
  }));

  return { nodes, label: 'Full spectrum · sub · bass · mid · presence · air', name: 'Full spectrum' };
}

// ── Archetype: scale-based (original, improved) ──────────────
const SCALES = {
  'Major':            [0, 2, 4, 5, 7, 9, 11],
  'Minor':            [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic':       [0, 2, 4, 7, 9],
  'Minor pentatonic': [0, 3, 5, 7, 10],
  'Dorian':           [0, 2, 3, 5, 7, 9, 10],
  'Lydian':           [0, 2, 4, 6, 7, 9, 11],
  'Phrygian':         [0, 1, 3, 5, 7, 8, 10],
};

function generateScale() {
  const scaleName  = pick(Object.keys(SCALES));
  const scale      = SCALES[scaleName];
  const rootNote   = Math.floor(Math.random() * 12);
  // octave 0 = sub, octave 6 = very high
  const rootOctave = Math.floor(Math.random() * 7);
  const rootBase   = rootOctave * 12 + rootNote;
  const count      = 3 + Math.floor(Math.random() * 4);

  const pool = [];
  for (let oct = 0; oct <= 2; oct++)
    for (const step of scale) pool.push(rootBase + step + oct * 12);
  pool.sort(() => Math.random() - 0.5);

  const nodes = pool.slice(0, count).map((semitone, i) => {
    const freq  = semitoneToFreq(semitone);
    const orbs  = [];
    if (i === 0) orbs.push({ target: 'volume', rate: rnd(0.04, 0.12), depth: 35, direction: rndDir(), enabled: true });
    else if (i % 3 === 1) orbs.push({ target: 'filter', rate: rnd(0.06, 0.18), depth: 40, direction: rndDir(), enabled: true });
    else orbs.push({ target: 'pan', rate: rnd(0.05, 0.15), depth: Math.floor(rnd(20, 55)), direction: rndDir(), enabled: true });

    return makeNode(freq, {
      type: pick(['sine', 'sine', 'sine', 'triangle', 'square']),
      volume: rnd(0.30, 0.55),
      filterFreq: freq * rnd(3, 8),
      reverb: rnd(0, 0.20),
      orbits: orbs,
    });
  });

  const rootName = NOTE_NAMES[rootNote] + rootOctave;
  return { nodes, label: `${rootName} ${scaleName} — ${count} nodes`, name: `${rootName} ${scaleName}` };
}

// ── Archetype: polyrhythm ─────────────────────────────────────
// Nodes at musical intervals, each pulsing at a different rate.
// Integer ratio LFO rates create evolving interference patterns.
const POLY_RATIO_SETS = [
  [1, 1.5, 2, 3],
  [2, 3, 4, 6],
  [3, 4, 5, 6],
  [1, 2, 3, 5],
  [2, 3, 5, 8],
];

function generatePolyrhythm() {
  const base    = rnd(0.04, 0.10);
  const ratios  = pick(POLY_RATIO_SETS);
  // wider range: from sub (25Hz) to presence (3kHz)
  const root    = rnd(25, 3000);
  const intervals = [1, 1.5, 2, 2.5, 3, 4, 6, 8];

  const nodes = ratios.map((ratio, i) => {
    const freq   = root * pick(intervals.slice(0, i + 2));
    const rate   = base * ratio;
    const panned = (i % 2 === 0 ? -1 : 1) * rnd(0.1, 0.6);
    return makeNode(freq, {
      type: pick(['sine', 'triangle', 'sine']),
      volume: rnd(0.30, 0.55),
      filterFreq: freq * rnd(4, 10),
      pan: panned,
      orbits: [
        { target: 'volume', rate, depth: Math.floor(rnd(50, 80)), direction: rndDir(), enabled: true },
        ...(i > 1 ? [{ target: 'filter', rate: rate * 0.7, depth: 30, direction: rndDir(), enabled: true }] : []),
      ],
    });
  });

  const ratioStr = ratios.join(':');
  return { nodes, label: `Polyrhythm · ${root.toFixed(0)}Hz root · ratios ${ratioStr}`, name: `Polyrhythm ${ratioStr}` };
}

// ── Archetype: gamelan bells ──────────────────────────────────
// High-freq metallic tones, inharmonic intervals, wide panning.
// Mimics metallophone / bell resonators.
const GAMELAN_INTERVALS = [1, 1.08, 1.27, 1.51, 1.68, 2, 2.46, 2.73, 3.12];

function generateGamelan() {
  const root  = rnd(300, 900);
  const count = 4 + Math.floor(Math.random() * 4);
  const chosen = [...GAMELAN_INTERVALS].sort(() => Math.random() - 0.5).slice(0, count);

  const nodes = chosen.map((interval, i) => {
    const freq = root * interval;
    const pan  = rnd(-0.85, 0.85) * (Math.random() > 0.5 ? 1 : -1);
    const panRate = rnd(0.03, 0.10);
    return makeNode(freq, {
      type: pick(['sine', 'triangle']),
      volume: rnd(0.20, 0.45) / (1 + i * 0.15),
      filterFreq: freq * rnd(1.5, 4),
      pan,
      reverb: rnd(0.15, 0.40),
      orbits: [
        { target: 'pan',    rate: panRate,          depth: Math.floor(rnd(40, 75)), direction: rndDir(), enabled: true },
        { target: 'volume', rate: panRate * rnd(1.3, 2.5), depth: Math.floor(rnd(30, 60)), direction: rndDir(), enabled: true },
      ],
    });
  });

  return { nodes, label: `Gamelan bells · ${root.toFixed(0)}Hz root · ${count} bells`, name: `Gamelan ${root.toFixed(0)}Hz` };
}

// ── Archetype: pentatonic pulse ───────────────────────────────
// Five pentatonic notes, each breathing at its own rate.
// Creates slowly evolving melodic texture.
const PENTATONIC_ROOTS = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 293.7];
const PENTATONIC_STEPS = [1, 1.125, 1.266, 1.5, 1.687, 2, 2.25, 2.531, 3];

function generatePentatonicPulse() {
  const root   = pick(PENTATONIC_ROOTS);
  const octave = Math.random() > 0.5 ? 1 : 2;
  const steps  = [...PENTATONIC_STEPS].sort(() => Math.random() - 0.5).slice(0, 5);
  const baseRate = rnd(0.04, 0.09);

  const nodes = steps.map((step, i) => {
    const freq = root * step * octave;
    const rate = baseRate * (1 + i * rnd(0.3, 0.8));
    return makeNode(freq, {
      type: i === 0 ? 'sine' : pick(['sine', 'sine', 'triangle']),
      volume: rnd(0.28, 0.50),
      filterFreq: freq * rnd(3, 7),
      pan: rnd(-0.6, 0.6),
      reverb: rnd(0.1, 0.3),
      orbits: [
        { target: 'volume', rate, depth: Math.floor(rnd(45, 75)), direction: rndDir(), enabled: true },
        ...(i % 2 === 1 ? [{ target: 'pan', rate: rate * 0.6, depth: Math.floor(rnd(20, 50)), direction: rndDir(), enabled: true }] : []),
      ],
    });
  });

  return { nodes, label: `Pentatonic pulse · ${root.toFixed(1)}Hz · 5 voices`, name: `Pentatonic ${root.toFixed(0)}Hz` };
}

// ── Archetype: Fibonacci / golden ratio ──────────────────────
// Frequencies and rates derived from Fibonacci sequence.
// φ = 1.618 creates naturally consonant intervals.
const PHI = 1.6180339887;
const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];

function generateFibonacci() {
  const baseFreq = rnd(55, 130);
  const count    = 4 + Math.floor(Math.random() * 3);
  const baseRate = rnd(0.03, 0.07);

  const nodes = Array.from({ length: count }, (_, i) => {
    const fibRatio = FIBONACCI[i + 2] / FIBONACCI[i + 1];
    const freq     = baseFreq * Math.pow(PHI, i * 0.75);
    const rate     = baseRate * (FIBONACCI[i + 1] / FIBONACCI[i + 2]);
    const pan      = i % 2 === 0 ? -rnd(0.1, 0.55) : rnd(0.1, 0.55);
    return makeNode(freq, {
      type: pick(['sine', 'sine', 'triangle']),
      volume: rnd(0.35, 0.55) / (1 + i * 0.25),
      filterFreq: freq * fibRatio * rnd(2, 5),
      pan,
      reverb: rnd(0.05, 0.25),
      orbits: [
        { target: 'volume', rate, depth: Math.floor(rnd(35, 65)), direction: rndDir(), enabled: true },
        { target: 'filter', rate: rate * PHI, depth: Math.floor(rnd(25, 50)), direction: rndDir(), enabled: true },
      ],
    });
  });

  return { nodes, label: `Fibonacci · φ=${PHI.toFixed(3)} · ${baseFreq.toFixed(1)}Hz base`, name: `Fibonacci ${baseFreq.toFixed(0)}Hz` };
}

// ── Archetype: drone swarm ────────────────────────────────────
// Cluster of slightly detuned unisons — thick beating texture.
// Like bowed strings or choir unison — micro-interference.
function generateDroneSwarm() {
  // wider range: can be sub bass or mid
  const root  = rnd(30, 600);
  const count = 5 + Math.floor(Math.random() * 4);
  const spread = rnd(2, 12);

  const nodes = Array.from({ length: count }, (_, i) => {
    const detune  = (i - count / 2) * spread;
    const freq    = root * Math.pow(2, detune / 1200);
    const panPos  = (i / (count - 1)) * 2 - 1;
    const panRate = rnd(0.02, 0.06) * (1 + i * 0.1);
    return makeNode(freq, {
      type: 'sine',
      volume: rnd(0.18, 0.30),
      filterFreq: freq * rnd(4, 9),
      pan: panPos * 0.7,
      reverb: rnd(0.2, 0.45),
      orbits: [
        { target: 'volume', rate: panRate, depth: Math.floor(rnd(30, 55)), direction: rndDir(), enabled: true },
        { target: 'pan',    rate: panRate * rnd(0.4, 0.8), depth: Math.floor(rnd(20, 45)), direction: rndDir(), enabled: true },
      ],
    });
  });

  return { nodes, label: `Drone swarm · ${root.toFixed(1)}Hz · ${count} voices · ±${spread.toFixed(1)}¢`, name: `Drone swarm ${root.toFixed(0)}Hz` };
}

// ── Archetype: deep sub ───────────────────────────────────────
// Sub-bass and infrasonic territory — felt more than heard.
function generateDeepSub() {
  const nodes = [];
  const root = rnd(14, 55);

  // fundamental — pure sub sine
  nodes.push(makeNode(root, {
    type: 'sine', volume: rnd(0.55, 0.72),
    filterFreq: rnd(60, 200),
    orbits: [{ target: 'volume', rate: rnd(0.02, 0.06), depth: 60, direction: rndDir(), enabled: true }],
  }));

  // octave harmonic
  nodes.push(makeNode(root * 2, {
    type: pick(['sine', 'triangle']), volume: rnd(0.28, 0.45),
    filterFreq: root * rnd(3, 6),
    orbits: [{ target: 'filter', rate: rnd(0.03, 0.09), depth: 50, direction: rndDir(), enabled: true }],
  }));

  // noise bed — adds warmth/texture to pure sub
  nodes.push(makeNode(root * rnd(3, 5), {
    type: 'noise', volume: rnd(0.08, 0.18),
    filterFreq: rnd(80, 300),
    reverb: rnd(0.2, 0.4),
    orbits: [{ target: 'filter', rate: rnd(0.05, 0.12), depth: 45, direction: rndDir(), enabled: true }],
  }));

  // optional: a fifth or third above root
  if (Math.random() > 0.4) {
    nodes.push(makeNode(root * pick([1.5, 1.25, 2.5]), {
      type: pick(['sine', 'sawtooth']), volume: rnd(0.14, 0.28),
      filterFreq: root * rnd(4, 8),
      pan: rnd(-0.5, 0.5),
      orbits: [{ target: 'volume', rate: rnd(0.04, 0.10), depth: 40, direction: rndDir(), enabled: true }],
    }));
  }

  return { nodes, label: `Deep sub · ${root.toFixed(1)}Hz root`, name: `Deep sub ${root.toFixed(0)}Hz` };
}

// ── Archetype: crystalline highs ─────────────────────────────
// High-frequency bell-like and shimmer textures (2kHz–20kHz).
function generateCrystalline() {
  const root  = rnd(1200, 5000);
  const count = 3 + Math.floor(Math.random() * 4);
  const INTERVALS = [1, 1.19, 1.41, 1.587, 1.782, 2, 2.38, 2.828];

  const nodes = Array.from({ length: count }, (_, i) => {
    const freq = root * pick(INTERVALS.slice(0, Math.min(i + 2, INTERVALS.length)));
    const pan  = (i % 2 === 0 ? -1 : 1) * rnd(0.2, 0.85);
    return makeNode(Math.min(freq, 18000), {
      type: pick(['sine', 'triangle', 'sine']),
      volume: rnd(0.15, 0.35) / (1 + i * 0.2),
      filterFreq: Math.min(freq * rnd(2, 5), 20000),
      pan,
      reverb: rnd(0.25, 0.55),
      orbits: [
        { target: 'pan',    rate: rnd(0.04, 0.14), depth: Math.floor(rnd(30, 65)), direction: rndDir(), enabled: true },
        { target: 'volume', rate: rnd(0.07, 0.20), depth: Math.floor(rnd(35, 60)), direction: rndDir(), enabled: true },
      ],
    });
  });

  // sub-octave grounding tone below the shimmer
  if (Math.random() > 0.5) {
    nodes.push(makeNode(root * 0.25, {
      type: 'sine', volume: rnd(0.22, 0.38),
      filterFreq: root * 0.6,
      orbits: [{ target: 'volume', rate: rnd(0.03, 0.08), depth: 45, direction: rndDir(), enabled: true }],
    }));
  }

  return { nodes, label: `Crystalline · ${root.toFixed(0)}Hz · ${count} voices`, name: `Crystalline ${root.toFixed(0)}Hz` };
}

// ── Archetype: noise texture ──────────────────────────────────
// Layered noise bands — granular, textural, atmospheric.
function generateNoiseTexture() {
  const nodes = [];
  const NOISE_BANDS = [
    { freq: rnd(25, 80),    filterFreq: rnd(60, 200),   label: 'rumble' },
    { freq: rnd(150, 400),  filterFreq: rnd(300, 900),  label: 'body'   },
    { freq: rnd(800, 2500), filterFreq: rnd(1500, 5000),label: 'hiss'   },
    { freq: rnd(4000,12000),filterFreq: rnd(8000,20000),label: 'air'    },
  ];
  const count = 2 + Math.floor(Math.random() * 3);
  const chosen = NOISE_BANDS.sort(() => Math.random() - 0.5).slice(0, count);

  for (const band of chosen) {
    nodes.push(makeNode(band.freq, {
      type: 'noise', volume: rnd(0.15, 0.38),
      filterFreq: band.filterFreq,
      pan: rnd(-0.7, 0.7),
      reverb: rnd(0.15, 0.45),
      orbits: [
        { target: 'filter', rate: rnd(0.03, 0.10), depth: Math.floor(rnd(40, 70)), direction: rndDir(), enabled: true },
        ...(Math.random() > 0.5 ? [{ target: 'pan', rate: rnd(0.02, 0.08), depth: Math.floor(rnd(20, 50)), direction: rndDir(), enabled: true }] : []),
      ],
    }));
  }

  // optional pitched tone woven into the noise
  if (Math.random() > 0.45) {
    const freq = rnd(80, 800);
    nodes.push(makeNode(freq, {
      type: pick(['sine', 'triangle']), volume: rnd(0.20, 0.38),
      filterFreq: freq * rnd(3, 8),
      reverb: rnd(0.10, 0.30),
      orbits: [{ target: 'volume', rate: rnd(0.04, 0.10), depth: 50, direction: rndDir(), enabled: true }],
    }));
  }

  const labels = chosen.map(b => b.label).join(' · ');
  return { nodes, label: `Noise texture · ${labels}`, name: `Noise texture` };
}

// ── Archetype: stochastic spread ─────────────────────────────
// Fully random notes across all 10 octaves — no harmonic logic.
// High entropy: sawtooth / square used more freely.
function generateStochastic() {
  const count = 3 + Math.floor(Math.random() * 5);
  const ALL_TYPES = ['sine', 'sine', 'triangle', 'square', 'sawtooth', 'noise'];

  const nodes = Array.from({ length: count }, (_, i) => {
    // spread uniformly across log-frequency (feels even across octaves)
    const octave = rnd(1, 10);
    const freq   = 16.35 * Math.pow(2, octave + Math.random());
    const type   = pick(ALL_TYPES);
    const pan    = (i % 2 === 0 ? -1 : 1) * rnd(0, 0.8);
    const orbs   = [];
    if (Math.random() > 0.3) orbs.push({ target: pick(['volume','filter','pan']), rate: rnd(0.03, 0.25), depth: Math.floor(rnd(30, 70)), direction: rndDir(), enabled: true });
    if (Math.random() > 0.6) orbs.push({ target: pick(['volume','filter']),        rate: rnd(0.05, 0.35), depth: Math.floor(rnd(25, 55)), direction: rndDir(), enabled: true });
    return makeNode(Math.min(freq, 18000), {
      type, volume: rnd(0.18, 0.48), pan,
      filterFreq: Math.min(freq * rnd(2, 12), 20000),
      reverb: rnd(0, 0.35),
      orbits: orbs,
    });
  });

  return { nodes, label: `Stochastic · ${count} random voices`, name: `Stochastic` };
}

// ── Drum preset archetypes ────────────────────────────────────
// Base positions per drum type: xNorm=left→right, yNorm=top→bottom (low=high filter)
const DRUM_NODE_LAYOUT = {
  kick:  { x: 0.50, y: 0.78 },
  snare: { x: 0.32, y: 0.52 },
  clap:  { x: 0.68, y: 0.48 },
  hihat: { x: 0.72, y: 0.18 },
  perc:  { x: 0.22, y: 0.28 },
};

function makeDrumNode(type, steps, { volume = 0.7, tune = null, decay = null, orbits = null } = {}) {
  const defaults = { ...TYPE_DEFAULTS[type] };
  if (tune  !== null) defaults.tune  = tune;
  if (decay !== null) defaults.decay = decay;

  const layout = DRUM_NODE_LAYOUT[type] ?? { x: 0.5, y: 0.5 };
  const jx = (Math.random() - 0.5) * 0.18;
  const jy = (Math.random() - 0.5) * 0.14;
  const xNorm = Math.max(0.08, Math.min(0.92, layout.x + jx));
  const yNorm = Math.max(0.06, Math.min(0.94, layout.y + jy));

  return {
    id: ++state.nodeSeq,
    x: xNorm * WORLD_WIDTH,
    y: TOP_H + yNorm * WORLD_HEIGHT,
    filterNorm: 1 - yNorm,
    type, muted: false, volume,
    panOverride: null,
    typeParams: defaults,
    steps: [...steps],
    orbits: orbits ?? [],
    pulsePhase: Math.random() * Math.PI * 2,
    rippleTimer: 0, _rippleNext: 20 + Math.random() * 60, audio: null,
  };
}

// euclidean rhythm distribution
function euclidean(steps, hits) {
  const pattern = Array(steps).fill(false);
  if (hits <= 0) return pattern;
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += hits;
    if (bucket >= steps) { bucket -= steps; pattern[i] = true; }
  }
  return pattern;
}

// Rhythm pattern generators
function probPattern(prob) {
  return Array.from({ length: 16 }, () => Math.random() < prob);
}
function shiftPattern(pattern, offset) {
  return [...pattern.slice(offset), ...pattern.slice(0, offset)];
}
function invertPattern(pattern) {
  return pattern.map(v => !v);
}

const GROOVE_PATTERNS = {
  kick: {
    'four-on-floor': () => [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0].map(Boolean),
    'breakbeat':     () => [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0].map(Boolean),
    'half-time':     () => [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0].map(Boolean),
    'sparse':        () => euclidean(16, 2 + Math.floor(Math.random() * 2)),
    'dense':         () => euclidean(16, 5 + Math.floor(Math.random() * 3)),
    'euclidean':     () => euclidean(16, 3 + Math.floor(Math.random() * 4)),
  },
  snare: {
    'four-on-floor': () => [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0].map(Boolean),
    'breakbeat':     () => [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0].map(Boolean),
    'half-time':     () => [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0].map(Boolean),
    'sparse':        () => euclidean(16, 2 + Math.floor(Math.random() * 2)),
    'dense':         () => euclidean(16, 4 + Math.floor(Math.random() * 3)),
    'euclidean':     () => shiftPattern(euclidean(16, 3 + Math.floor(Math.random() * 3)), 4),
  },
  hihat: {
    'four-on-floor': () => euclidean(16, 8 + Math.floor(Math.random() * 4)),
    'breakbeat':     () => euclidean(16, 12),
    'half-time':     () => euclidean(16, 6 + Math.floor(Math.random() * 3)),
    'sparse':        () => euclidean(16, 4 + Math.floor(Math.random() * 3)),
    'dense':         () => euclidean(16, 12 + Math.floor(Math.random() * 4)),
    'euclidean':     () => euclidean(16, 7 + Math.floor(Math.random() * 6)),
  },
  clap: {
    'four-on-floor': () => [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,Math.random()>.5?1:0].map(Boolean),
    'breakbeat':     () => probPattern(0.22),
    'half-time':     () => [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1].map(Boolean),
    'sparse':        () => euclidean(16, 1 + Math.floor(Math.random() * 2)),
    'dense':         () => probPattern(0.3),
    'euclidean':     () => euclidean(16, 2 + Math.floor(Math.random() * 3)),
  },
  perc: {
    'four-on-floor': () => shiftPattern(euclidean(16, 3 + Math.floor(Math.random() * 3)), 2),
    'breakbeat':     () => probPattern(0.2),
    'half-time':     () => euclidean(16, 3 + Math.floor(Math.random() * 2)),
    'sparse':        () => euclidean(16, 2 + Math.floor(Math.random() * 2)),
    'dense':         () => probPattern(0.35),
    'euclidean':     () => euclidean(16, 4 + Math.floor(Math.random() * 4)),
  },
};

function drumPattern(type, style) {
  return (GROOVE_PATTERNS[type]?.[style] ?? (() => euclidean(16, 4)))();
}

function generateDrumKit() {
  state.nodes = [];
  state.nodeSeq = 0;

  state.bpm = pick([75, 85, 90, 95, 100, 110, 120, 125, 130, 140]);
  const bpmDisplay = document.getElementById('bpm-display');
  if (bpmDisplay) bpmDisplay.textContent = `${state.bpm} BPM`;

  const style = pick(['four-on-floor', 'breakbeat', 'half-time', 'euclidean', 'sparse', 'dense']);

  // Decide composition randomly — each type may appear 0, 1 or 2 times
  const slots = [];

  // kick: almost always present, sometimes doubled for polyrhythm
  if (Math.random() < 0.88) {
    slots.push('kick');
    if (Math.random() < 0.25) slots.push('kick'); // second kick with offset pattern
  }
  // snare: usually present
  if (Math.random() < 0.75) {
    slots.push('snare');
    if (Math.random() < 0.15) slots.push('snare');
  }
  // hihat: usually present, often doubled (closed + open feel)
  if (Math.random() < 0.80) {
    slots.push('hihat');
    if (Math.random() < 0.35) slots.push('hihat');
  }
  // clap: optional
  if (Math.random() < 0.50) slots.push('clap');
  // perc: occasional colour
  if (Math.random() < 0.40) {
    slots.push('perc');
    if (Math.random() < 0.20) slots.push('perc');
  }

  // guarantee minimum 2 nodes
  if (slots.length === 0) { slots.push('kick'); slots.push('hihat'); }
  if (slots.length === 1) { slots.push(slots[0] === 'hihat' ? 'kick' : 'hihat'); }

  // cap at 6 nodes to keep it playable
  while (slots.length > 6) slots.splice(Math.floor(Math.random() * slots.length), 1);

  const typeCount = {};
  const nodes = slots.map(type => {
    typeCount[type] = (typeCount[type] ?? 0) + 1;
    const instanceIdx = typeCount[type];
    let pattern = drumPattern(type, style);

    // second instance of same type: offset or invert for contrast
    if (instanceIdx === 2) {
      pattern = Math.random() < 0.5
        ? shiftPattern(pattern, 2 + Math.floor(Math.random() * 6))
        : invertPattern(pattern).map((v, i) => v && Math.random() < 0.6);
    }

    const params = {
      kick:  { volume: rnd(0.70, 0.88), tune: rnd(45, 85),   decay: rnd(0.20, 0.55), orbits: rndDrumOrbits() },
      snare: { volume: rnd(0.55, 0.78), decay: rnd(0.10, 0.28),                       orbits: rndDrumOrbits() },
      hihat: { volume: rnd(0.35, 0.60), tune: rnd(280, 700), decay: instanceIdx === 2 ? rnd(0.15, 0.35) : rnd(0.03, 0.10), orbits: rndDrumOrbits() },
      clap:  { volume: rnd(0.50, 0.68), decay: rnd(0.06, 0.20),                       orbits: rndDrumOrbits() },
      perc:  { volume: rnd(0.40, 0.65), tune: rnd(80, 600),  decay: rnd(0.08, 0.30), orbits: rndDrumOrbits() },
    }[type];

    return makeDrumNode(type, pattern, params);
  });

  const typeList = [...new Set(slots)].join('+');
  return {
    nodes,
    label: `Drum kit · ${style} · ${typeList} (${slots.length})`,
    name:  'Drum kit',
  };
}

function generateDrumWithBass() {
  const { nodes, label } = generateDrumKit();
  const bassFreq = pick([40, 50, 55, 65, 80]);
  const bassNode = makeNode(bassFreq, {
    type: 'sine', volume: rnd(0.4, 0.6),
    filterFreq: bassFreq * 3,
    orbits: [{ target: 'filter', rate: rnd(0.05, 0.15), depth: 35, direction: rndDir(), enabled: true }],
  });
  return { nodes: [...nodes, bassNode], label: label + ' + bass', name: 'Drum + bass' };
}

function generateDrumWithPad() {
  const { nodes, label } = generateDrumKit();
  const root = pick([55, 65, 82, 110, 130, 165, 220]);
  const ratios = pick([[1, 1.5, 2], [1, 1.25, 1.5, 2], [1, 2, 3]]);
  const padNodes = ratios.map((r, i) => makeNode(root * r, {
    type: pick(['triangle', 'sine', 'sawtooth']),
    volume: rnd(0.15, 0.30),
    filterFreq: root * r * rnd(2, 5),
    reverb: rnd(0.3, 0.7),
    orbits: [
      { target: 'volume', rate: rnd(0.04, 0.12), depth: Math.floor(rnd(30, 55)), direction: rndDir(), enabled: true },
      ...(i === 0 ? [{ target: 'filter', rate: rnd(0.03, 0.09), depth: Math.floor(rnd(25, 45)), direction: rndDir(), enabled: true }] : []),
    ],
  }));
  return { nodes: [...nodes, ...padNodes], label: label + ' + pad', name: 'Drum + pad' };
}

function generateDrumWithDrone() {
  const { nodes, label } = generateDrumKit();
  const root = pick([40, 55, 65, 82, 110]);
  const droneNodes = [root, root * 2, root * 0.5].slice(0, 2 + Math.floor(Math.random() * 2)).map(freq => makeNode(freq, {
    type: pick(['sine', 'triangle', 'noise']),
    volume: rnd(0.12, 0.25),
    filterFreq: freq * rnd(1.5, 4),
    reverb: rnd(0.4, 0.8),
    orbits: [
      { target: 'volume', rate: rnd(0.02, 0.07), depth: Math.floor(rnd(40, 65)), direction: rndDir(), enabled: true },
      { target: 'pan',    rate: rnd(0.03, 0.10), depth: Math.floor(rnd(20, 45)), direction: rndDir(), enabled: true },
    ],
  }));
  return { nodes: [...nodes, ...droneNodes], label: label + ' + drone', name: 'Drum + drone' };
}

function generateDrumWithTexture() {
  const { nodes, label } = generateDrumKit();
  const textureNode = makeNode(rnd(200, 2000), {
    type: 'noise',
    volume: rnd(0.10, 0.20),
    filterFreq: rnd(300, 3000),
    reverb: rnd(0.5, 0.9),
    orbits: [
      { target: 'filter', rate: rnd(0.05, 0.18), depth: Math.floor(rnd(35, 60)), direction: rndDir(), enabled: true },
      { target: 'volume', rate: rnd(0.07, 0.22), depth: Math.floor(rnd(30, 55)), direction: rndDir(), enabled: true },
    ],
  });
  return { nodes: [...nodes, textureNode], label: label + ' + texture', name: 'Drum + texture' };
}

// ── Dispatcher ────────────────────────────────────────────────
const ARCHETYPES = [
  { weight: 2, fn: generateBinaural        },
  { weight: 2, fn: generateSolfeggio       },
  { weight: 2, fn: generateHarmonicSeries  },
  { weight: 2, fn: generateFullSpectrum    },
  { weight: 2, fn: generateScale           },
  { weight: 2, fn: generatePolyrhythm      },
  { weight: 2, fn: generateGamelan         },
  { weight: 2, fn: generatePentatonicPulse },
  { weight: 2, fn: generateFibonacci       },
  { weight: 2, fn: generateDroneSwarm      },
  { weight: 2, fn: generateDeepSub         },
  { weight: 2, fn: generateCrystalline     },
  { weight: 2, fn: generateNoiseTexture    },
  { weight: 1, fn: generateStochastic      },
];

const BEAT_ARCHETYPES = [
  { weight: 3, fn: generateDrumKit         },
  { weight: 2, fn: generateDrumWithBass    },
  { weight: 2, fn: generateDrumWithPad     },
  { weight: 2, fn: generateDrumWithDrone   },
  { weight: 2, fn: generateDrumWithTexture },
];

let lastArchetypeFn = null;

function generateHarmonicPreset() {
  for (const node of [...state.nodes]) removeNode(node);
  state.nodeSeq = 0;

  // in beat mode pick drum archetype, otherwise pick ambient
  const pool = state.beatMode ? BEAT_ARCHETYPES : ARCHETYPES;
  // exclude the last-used archetype to avoid immediate repeats
  const eligible = pool.length > 1 ? pool.filter(a => a.fn !== lastArchetypeFn) : pool;
  const total    = eligible.reduce((s, a) => s + a.weight, 0);
  let r          = Math.random() * total;
  const archetype = eligible.find(a => (r -= a.weight) < 0) ?? eligible[0];
  lastArchetypeFn = archetype.fn;
  const { nodes, label, name } = archetype.fn();

  for (const node of nodes) {
    state.nodes.push(node);
    if (!DRUM_TYPES.has(node.type)) createAudio(node);
  }
  syncCount();

  applyGlobal({
    vol:    60 + Math.floor(Math.random() * 15),
    grav:   15 + Math.floor(Math.random() * 25),
    tone:   55 + Math.floor(Math.random() * 30),
    spread: 25 + Math.floor(Math.random() * 35),
  });

  fitAllNodes();
  showToast(label);

  const nameInput = document.getElementById('preset-name-input');
  if (nameInput) nameInput.value = name;
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

  // comet move-center mode: next tap relocates orbit center
  if (cometMoveMode) {
    const comet = getSelectedComet();
    if (comet) {
      const w = screenToWorld(e.clientX, e.clientY);
      comet.cx = w.x;
      comet.cy = w.y;
    }
    cometMoveMode = false;
    const btn = document.getElementById('cp-move-btn');
    btn.classList.remove('active');
    document.getElementById('cp-move-val').textContent = 'Tap';
    return;
  }

  const hit = hitTest(e.clientX, e.clientY);

  // check comet hit before node logic
  if (!hit) {
    const w = screenToWorld(e.clientX, e.clientY);
    const cometHit = state.comets.find(c => {
      const pos = cometWorldPos(c);
      return Math.hypot(w.x - pos.x, w.y - pos.y) <= 24 / state.zoom;
    });
    if (cometHit) { selectComet(cometHit); return; }
  }

  if (state.selectedNode && !hit)              { deselectNode(); return; }
  if (state.selectedNode && hit && hit !== state.selectedNode) { selectNode(hit); return; }

  pDown = Date.now(); didDrag = false; state.velX = 0; state.velY = 0;
  if (hit) {
    dragNode = hit; pNode = hit;
    state.draggingNodeId = hit.id;
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
    if (DRUM_TYPES.has(dragNode.type)) {
      const params = dragNode.typeParams ?? {};
      // X → tune (log scale: left=low, right=high)
      const xNorm = Math.max(0, Math.min(1, dragNode.x / WORLD_WIDTH));
      if (dragNode.type === 'kick')  params.tune = Math.round(20 + xNorm * 180);
      if (dragNode.type === 'hihat') params.tune = Math.round(100 + xNorm * 5900);
      if (dragNode.type === 'perc')  params.tune = Math.round(60 + xNorm * 1940);
      // Y → decay (top=long, bottom=short)
      const yNorm = 1 - dragNode.filterNorm;
      params.decay = parseFloat((0.02 + yNorm * 1.3).toFixed(3));
    } else {
      updateAudio(dragNode);
    }
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
  state.draggingNodeId = null;
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
let lastSlow    = 0;
let lastFrame   = 0;
let gravityFrame = 0;
let frameBudgetMs = 33;
const FRAME_TARGET_MS = 33; // ~30fps

// ── Comets ────────────────────────────────────────────────────
const COMET_COLORS = ['#a8d8ff', '#ffe8a8', '#c8a8ff', '#a8ffd8', '#ffa8c8'];
const COMET_MAX    = 5;
const COMET_TRAIL  = 32;

function spawnComet() {
  if (state.comets.length >= COMET_MAX) state.comets.shift();

  const orbitScale   = state.cometOrbitScale   ?? 1;
  const speedScale   = state.cometSpeedScale   ?? 1;
  const gravityScale = state.cometGravityScale ?? 1;

  const vCx = state.viewX + canvas.width  / state.zoom / 2;
  const vCy = state.viewY + canvas.height / state.zoom / 2;
  const spread = Math.max(canvas.width, canvas.height) / state.zoom * 0.7;

  const cx = vCx + (Math.random() - 0.5) * spread * 0.5;
  const cy = vCy + (Math.random() - 0.5) * spread * 0.5;

  const rx = spread * (0.3 + Math.random() * 0.5) * orbitScale;
  const ry = rx * (0.4 + Math.random() * 0.5);
  const tilt  = Math.random() * Math.PI * 2;
  const speed = (0.015 + Math.random() * 0.025) * (Math.random() < 0.5 ? 1 : -1) * speedScale;
  const mass  = (0.6 + Math.random() * 0.8) * gravityScale;
  const influence = (200 + Math.random() * 250) * Math.max(0.4, gravityScale);
  const color = COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)];
  const lifeSeconds = 14 + Math.random() * 16;

  const maxLife = Math.round(lifeSeconds * 60);
  state.comets.push({
    id: Date.now() + Math.random(),
    cx, cy, rx, ry, tilt,
    angle: Math.random() * Math.PI * 2,
    speed, mass, influence, color,
    size: 4 + Math.random() * 4,
    trail: [],
    life: maxLife, maxLife,
    permanent: false,
    fadeSpeed: 1,
    // base values for slider display — fixed at spawn, never overwritten
    _baseRx: rx, _baseMass: mass, _baseInfluence: influence,
  });
}

function cometWorldPos(c) {
  const cosT = Math.cos(c.tilt), sinT = Math.sin(c.tilt);
  const ex = c.rx * Math.cos(c.angle);
  const ey = c.ry * Math.sin(c.angle);
  return {
    x: c.cx + ex * cosT - ey * sinT,
    y: c.cy + ex * sinT + ey * cosT,
  };
}

function updateComets(time) {
  const touchedNodes = new Set();

  for (let i = state.comets.length - 1; i >= 0; i--) {
    const c = state.comets[i];
    if (!c.permanent) {
      c.life -= (c.fadeSpeed ?? 1);
      if (c.life <= 0) { state.comets.splice(i, 1); continue; }
    }

    c.angle += c.speed;
    const pos = cometWorldPos(c);

    c.trail.unshift({ x: pos.x, y: pos.y });
    if (c.trail.length > COMET_TRAIL) c.trail.length = COMET_TRAIL;

    if (c.permanent) {
      c.alpha = 1;
    } else {
      const lifeRatio = c.life / c.maxLife;
      const fadeIn  = 1 - Math.max(0, (lifeRatio - 0.85) / 0.15);
      const fadeOut = Math.min(1, lifeRatio / 0.12);
      c.alpha = fadeIn * fadeOut;
    }

    for (const node of state.nodes) {
      if (node === dragNode) continue;
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4 || dist > c.influence) continue;

      touchedNodes.add(node);
      const t     = 1 - dist / c.influence;
      const force = c.mass * t * t * 15 * c.alpha;

      node._cDx = (node._cDx ?? 0) + (dx / dist) * force;
      node._cDy = (node._cDy ?? 0) + (dy / dist) * force;
      const disp = Math.hypot(node._cDx, node._cDy);
      if (disp > 100) { node._cDx = node._cDx / disp * 100; node._cDy = node._cDy / disp * 100; }
    }
  }

  // spring restore — separate touched vs untouched to avoid double decay
  for (const node of state.nodes) {
    if (touchedNodes.has(node)) {
      node._cDx = (node._cDx ?? 0) * 0.88;
      node._cDy = (node._cDy ?? 0) * 0.88;
    } else {
      node._cDx = (node._cDx ?? 0) * 0.84;
      node._cDy = (node._cDy ?? 0) * 0.84;
      if (Math.abs(node._cDx) < 0.5) node._cDx = 0;
      if (Math.abs(node._cDy) < 0.5) node._cDy = 0;
    }
  }
}

function drawComets(ctx, time) {
  for (const c of state.comets) {
    if (!c.trail.length) continue;
    const alpha = c.alpha ?? 1;

    // trail
    for (let i = 1; i < c.trail.length; i++) {
      const t0 = c.trail[i - 1], t1 = c.trail[i];
      const trailAlpha = alpha * (1 - i / c.trail.length) * 0.7;
      const width = c.size * (1 - i / c.trail.length) * 1.2;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.strokeStyle = c.color + Math.round(trailAlpha * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = Math.max(0.5, width);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // head glow
    const head = c.trail[0];
    const grad = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, c.size * 3);
    grad.addColorStop(0, c.color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
    grad.addColorStop(0.4, c.color + Math.round(alpha * 140).toString(16).padStart(2, '0'));
    grad.addColorStop(1, c.color + '00');
    ctx.beginPath();
    ctx.arc(head.x, head.y, c.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // solid core
    ctx.beginPath();
    ctx.arc(head.x, head.y, c.size * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff' + Math.round(alpha * 220).toString(16).padStart(2, '0');
    ctx.fill();
  }
}

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

  // physical gravity drift — runs every 3rd frame to reduce main-thread load
  gravityFrame = (gravityFrame + 1) % 3;
  if (gravityFrame === 0 && state.gravityStrength > 0.01 && state.nodes.length > 1) {
    // cluster radius scales with gravity: low gravity = tight local groups, high = wider pull
    const clusterR = Math.hypot(canvas.width, canvas.height) * (0.08 + state.gravityStrength * 0.18);
    for (const node of state.nodes) {
      if (node === dragNode || node.muted) continue;
      let fx = 0, fy = 0;
      for (const other of state.nodes) {
        if (other === node) continue;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3 || dist > clusterR) continue;
        // gaussian falloff: full strength at 0, zero at clusterR
        const t     = dist / clusterR;
        const force = state.gravityStrength * 0.018 * Math.exp(-t * t * 4);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      node.x += fx;
      node.y += fy;
      // Use WORLD_HEIGHT (fixed) so filterNorm is screen-size independent (fix B-02).
      node.filterNorm = Math.max(0.02, Math.min(0.98, (node.y - TOP_H) / WORLD_HEIGHT));
    }
  }

  // ── Comet physics & audio influence ──────────────────────────
  updateComets(time);

  // sync comet panel: update life bar, close if selected comet expired
  if (selectedCometId !== null) {
    const sel = getSelectedComet();
    if (!sel) { deselectComet(); }
    else { updateCometLifeDisplay(sel); renderCometList(); /* rebuilds only if comet set changed */ }
  }

  // Apply comet displacement to node positions for this frame.
  // All drawing, gravity, and audio calculations see the displaced coordinates.
  for (const node of state.nodes) {
    node.x += node._cDx ?? 0;
    node.y += node._cDy ?? 0;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  context.save();
  context.scale(state.zoom, state.zoom);
  context.translate(-state.viewX, -state.viewY);
  for (const node of state.nodes) if (!node.muted) drawNodeWaves(node, time);
  drawLinks();
  drawRipples();
  drawComets(context, time);
  for (const node of state.nodes) {
    drawOrbits(node, time);
    drawNode(node, time);
  }
  context.restore();

  drawViewIndicator();

  if (state.isPlaying) {
    for (const node of state.nodes) {
      if (node._beatFlash) {
        node._beatFlash = false;
        spawnRipple(node);
      }
    }
    for (const node of state.nodes) {
      if (node.muted || DRUM_TYPES.has(node.type)) continue;
      node.rippleTimer++;
      if (node.rippleTimer >= node._rippleNext) {
        const base = rippleInterval(node);
        node._rippleNext = base * (0.6 + Math.abs(Math.sin(time * 0.00031 + node.pulsePhase)) * 0.85);
        node.rippleTimer = 0;
        spawnRipple(node);
      }
    }
  }

  if (time - lastSlow > 100) {
    for (const node of state.nodes) {
      // temporarily update filterNorm from displaced y so audio reflects comet position
      const savedFilterNorm = node.filterNorm;
      if (!DRUM_TYPES.has(node.type) && (node._cDy ?? 0) !== 0) {
        node.filterNorm = Math.max(0.02, Math.min(0.98, (node.y - TOP_H) / WORLD_HEIGHT));
      }
      updateAudio(node);
      node.filterNorm = savedFilterNorm;
    }
    if (state.selectedNode) updateNodeInfoStrip(state.selectedNode);
    updateAnalytics();
    drawSpectrum();
    lastSlow = time;
  }

  // Restore actual node positions after frame is complete.
  for (const node of state.nodes) {
    node.x -= node._cDx ?? 0;
    node.y -= node._cDy ?? 0;
  }
}

loop();

// ── Service worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
