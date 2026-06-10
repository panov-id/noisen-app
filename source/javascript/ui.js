// ── UI: panels, overlays, tooltips, toasts, wizard, presets ──

import {
  state, APP_VERSION, TYPES, TYPE_DEFAULTS, WAVE_ICONS, PARAM_ICONS,
  saveSettings, loadSettings,
} from './store.js';
import {
  nodeFreq, filterFromNorm, effectivePan, gravityFactor, gravityPull,
  createAudio, destroyAudio, updateAudio, rebuildAudio,
  masterGain, masterFilter, masterReverb, masterDelay, locut, hiCut,
  locutHz, hicutHz, decaySeconds, delayMilliseconds, toneHz,
} from './audio.js';

// ── Format helpers ────────────────────────────────────────────
export function fmtHz(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}kHz`;
  return `${Math.round(hz)}Hz`;
}
export function fmtPan(p) {
  return p < -.02 ? `L${Math.abs(Math.round(p * 100))}%`
       : p > .02  ? `R${Math.round(p * 100)}%` : 'C';
}

export function setSliderPct(el, value, min, max) {
  el.style.setProperty('--pct', ((value - min) / (max - min) * 100).toFixed(1) + '%');
}

// ── Toast ─────────────────────────────────────────────────────
export function showToast(message) {
  const el = document.getElementById('toast');
  clearTimeout(el._timer);
  el.textContent  = message;
  el.style.opacity = '1';
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
}

// ── Theme ─────────────────────────────────────────────────────
export function applyTheme(dark, persist = true) {
  state.isDark = dark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.getElementById('ti-light').style.display = dark ? 'none' : '';
  document.getElementById('ti-dark').style.display  = dark ? ''     : 'none';
  if (persist) saveSettings({ theme: dark ? 'dark' : 'light' });
}

// ── Global param sync ─────────────────────────────────────────
export function applyGlobal(globalParams) {
  state.masterVolume    = globalParams.vol    / 100;
  state.gravityStrength = globalParams.grav   / 100;
  state.masterTone      = globalParams.tone   / 100;
  state.waveSpread      = globalParams.spread / 100;
  masterGain.gain.value = state.masterVolume;
  masterFilter.frequency.value = toneHz(state.masterTone);

  const syncSlider = (id, labelId, value) => {
    const el = document.getElementById(id);
    el.value = value;
    setSliderPct(el, value, 0, 100);
    document.getElementById(labelId).textContent = `${value}%`;
  };
  syncSlider('vol',    'gv-vol-val',    globalParams.vol);
  syncSlider('grav',   'gv-grav-val',   globalParams.grav);
  syncSlider('tone',   'gv-tone-val',   globalParams.tone);
  syncSlider('spread', 'gv-spread-val', globalParams.spread);
  document.getElementById('an-grav').textContent = `${globalParams.grav}%`;
}

// ── Node panel ────────────────────────────────────────────────
const globalView = document.getElementById('global-view');
const nodeView   = document.getElementById('node-view');
const nodeCards  = document.getElementById('node-cards');

function makeCard(opts) {
  const card = document.createElement('div');
  card.className = 'param-card';
  if (opts.tip) {
    card.dataset.tip     = opts.tip;
    card.dataset.tipDesc = opts.tipDesc || '';
  }
  const pct = ((opts.value - opts.min) / (opts.max - opts.min) * 100).toFixed(1) + '%';
  card.innerHTML = `
    <div class="card-top">
      <span class="card-icon">${opts.icon}</span>
      <span class="card-val" id="cv-${opts.id}">${opts.fmt(opts.value)}</span>
    </div>
    <input type="range" class="card-slider" id="cs-${opts.id}"
      min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}" style="--pct:${pct}">
    <span class="card-label">${opts.label}</span>`;
  const slider = card.querySelector('input');
  slider.addEventListener('input', () => {
    const v = slider.valueAsNumber;
    setSliderPct(slider, v, opts.min, opts.max);
    card.querySelector('.card-val').textContent = opts.fmt(v);
    opts.onChange(v);
  });
  return card;
}

function makeNoiseColorCard(node) {
  const card = document.createElement('div');
  card.className     = 'param-card';
  card.dataset.tip    = 'Noise color';
  card.dataset.tipDesc = 'Spectral character of the noise';
  const colors = ['white', 'pink', 'brown'];
  card.innerHTML = `
    <div class="card-top">
      <span class="card-icon">${PARAM_ICONS.noise}</span>
      <span class="card-val" id="cv-nc">${node.typeParams.color}</span>
    </div>
    <div class="nc-group">
      ${colors.map(c => `<button class="nc-btn${node.typeParams.color === c ? ' active' : ''}" data-c="${c}">${c}</button>`).join('')}
    </div>
    <span class="card-label">Color</span>`;
  card.querySelectorAll('.nc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      node.typeParams.color = btn.dataset.c;
      card.querySelector('.card-val').textContent = btn.dataset.c;
      card.querySelectorAll('.nc-btn').forEach(b => b.classList.toggle('active', b.dataset.c === btn.dataset.c));
      rebuildAudio(node);
    });
  });
  return card;
}

export function buildNodeCards(node) {
  nodeCards.innerHTML = '';
  const color    = TYPES[node.type].color;
  const [r, g, b] = TYPES[node.type].rgb;
  const colorDim = `rgba(${r},${g},${b},.12)`;

  nodeCards.style.setProperty('--card-accent',     color);
  nodeCards.style.setProperty('--card-accent-dim', colorDim);

  const mkC = (id, iconKey, label, tip, tipDesc, min, max, step, val, fmt, onChange) =>
    makeCard({ id, icon: PARAM_ICONS[iconKey] || iconKey, label, tip, tipDesc, min, max, step, value: val, fmt, onChange });

  const fmtSec = v => v >= 1 ? `${(+v).toFixed(1)}s` : `${Math.round(v * 1000)}ms`;

  nodeCards.appendChild(mkC('vol','vol','Volume','Node volume','Loudness and visual size',
    5,100,1,Math.round(node.volume*100),v=>`${v}%`,v=>{ node.volume=v/100; updateAudio(node); }));
  nodeCards.appendChild(mkC('pan','pan','Pan','Stereo pan','Left/right, overrides X-axis',
    -100,100,1,Math.round(effectivePan(node)*100),v=>fmtPan(v/100),v=>{ node.panOverride=v/100; updateAudio(node); }));

  nodeCards.appendChild(mkC('atk','atk','Attack','Envelope attack','Fade-in time',
    0.01,10,.01,node.attack??0.3,fmtSec,v=>{ node.attack=+v; if(node.audio) node.audio.envelope.attack=+v; }));
  nodeCards.appendChild(mkC('dcy','dcy','Decay','Envelope decay','Fall to sustain level',
    0.01,5,.01,node.decay??0.1,fmtSec,v=>{ node.decay=+v; if(node.audio) node.audio.envelope.decay=+v; }));
  nodeCards.appendChild(mkC('sus','sus','Sustain','Envelope sustain','Held level',
    0,100,1,node.sustain??100,v=>`${v}%`,v=>{ node.sustain=+v; if(node.audio) node.audio.envelope.sustain=v/100; }));
  nodeCards.appendChild(mkC('rel','rel','Release','Envelope release','Fade-out time',
    0.01,10,.01,node.release??0.8,fmtSec,v=>{ node.release=+v; if(node.audio) node.audio.envelope.release=+v; }));

  if (node.type === 'sine' || node.type === 'triangle') {
    nodeCards.appendChild(mkC('det','det','Detune','Detune','Fine pitch in cents',-1200,1200,1,node.typeParams.detune,v=>`${v}¢`,v=>{ node.typeParams.detune=v; updateAudio(node); }));
    nodeCards.appendChild(mkC('vib','vib','Vibrato Hz','Vibrato rate','LFO speed',0,20,.1,node.typeParams.vibratoRate,v=>`${(+v).toFixed(1)}Hz`,v=>{ node.typeParams.vibratoRate=v; rebuildAudio(node); }));
    nodeCards.appendChild(mkC('dep','dep','Vib depth','Vibrato depth','Depth in cents',0,400,1,node.typeParams.vibratoDepth,v=>`${v}¢`,v=>{ node.typeParams.vibratoDepth=v; rebuildAudio(node); }));
  } else if (node.type === 'square' || node.type === 'sawtooth') {
    nodeCards.appendChild(mkC('det','det','Detune','Detune','Fine pitch in cents',-1200,1200,1,node.typeParams.detune,v=>`${v}¢`,v=>{ node.typeParams.detune=v; updateAudio(node); }));
    nodeCards.appendChild(mkC('vcs','vcs','Voices','Voices','Detuned copies',1,5,1,node.typeParams.voices,v=>`×${v}`,v=>{ node.typeParams.voices=v; rebuildAudio(node); }));
    nodeCards.appendChild(mkC('spr','spr','Spread','Spread','Cents between voices',0,100,1,node.typeParams.spread,v=>`${v}¢`,v=>{ node.typeParams.spread=v; rebuildAudio(node); }));
  } else if (node.type === 'noise') {
    nodeCards.appendChild(makeNoiseColorCard(node));
    nodeCards.appendChild(mkC('res','res','Resonance','Resonance','Filter Q',.5,20,.5,node.typeParams.resonance,v=>`Q${(+v).toFixed(1)}`,v=>{ node.typeParams.resonance=v; updateAudio(node); }));
  }

  nodeCards.appendChild(mkC('fcut','fcut','Filter','Filter cutoff','Lowpass cutoff frequency',
    0,100,1,Math.round((node.filterNorm??0.5)*100),v=>`${Math.round(filterFromNorm(v/100))}Hz`,v=>{ node.filterNorm=v/100; updateAudio(node); }));
  nodeCards.appendChild(mkC('rsnd','rsnd','Reverb','Reverb send','Amount routed to master reverb bus',
    0,100,1,Math.round((node.reverbSend??0)*100),v=>`${v}%`,v=>{ node.reverbSend=v/100; if(node.audio) node.audio.reverbSend.gain.rampTo(node.reverbSend,.1); }));
  nodeCards.appendChild(mkC('dsnd','dsnd','Bus Dly','Delay bus send','Amount routed to master delay bus',
    0,100,1,Math.round((node.delaySend??0)*100),v=>`${v}%`,v=>{ node.delaySend=v/100; if(node.audio) node.audio.delaySend.gain.rampTo(node.delaySend,.1); }));
  nodeCards.appendChild(mkC('ndly','ndly','Dly Time','Node delay time','Local echo delay in ms',
    10,1000,10,node.nodeDelayTime??250,v=>`${v}ms`,v=>{ node.nodeDelayTime=v; if(node.audio) node.audio.nodeDelay.delayTime.rampTo(v/1000,.1); }));
  nodeCards.appendChild(mkC('nfdb','nfdb','Dly Fbk','Node delay feedback','Echo repeat amount',
    0,90,1,node.nodeDelayFeedback??0,v=>`${v}%`,v=>{ node.nodeDelayFeedback=v; if(node.audio) node.audio.nodeDelay.feedback.rampTo(v/100,.1); }));
  nodeCards.appendChild(mkC('nwet','nwet','Dly Wet','Node delay wet','Local echo mix',
    0,100,1,node.nodeDelayWet??0,v=>`${v}%`,v=>{ node.nodeDelayWet=v; if(node.audio) node.audio.nodeDelay.wet.rampTo(v/100,.1); }));

  nodeCards.querySelectorAll('.param-card').forEach(c => {
    c.style.setProperty('--card-accent',     color);
    c.style.setProperty('--card-accent-dim', colorDim);
  });
}

export function buildTypeButtons(node) {
  const row = document.getElementById('type-btns');
  row.innerHTML = '';
  Object.keys(TYPES).forEach(type => {
    const btn = document.createElement('button');
    btn.className   = 'type-btn' + (node.type === type ? ' active' : '');
    btn.dataset.tip = type.charAt(0).toUpperCase() + type.slice(1);
    btn.innerHTML   = WAVE_ICONS[type] + `<span>${type}</span>`;
    btn.addEventListener('click', () => {
      node.type       = type;
      node.typeParams = { ...TYPE_DEFAULTS[type] };
      rebuildAudio(node);
      selectNode(node);
    });
    row.appendChild(btn);
  });
}

export function updateNodeInfoStrip(node) {
  if (!node) return;
  const freq   = nodeFreq(node);
  const filter = filterFromNorm(node.filterNorm ?? 0.5);
  const pan    = effectivePan(node);
  const pull   = gravityPull(node);
  document.getElementById('ni-freq').textContent   = fmtHz(freq);
  document.getElementById('ni-filter').textContent = fmtHz(filter);
  document.getElementById('ni-pan').textContent    = fmtPan(pan);
  document.getElementById('ni-grav').textContent   = pull > .01 ? `${(pull * 100).toFixed(0)}%` : '—';
  document.getElementById('ni-vol').textContent    = `${Math.round(node.volume * 100)}%`;
}

export function selectNode(node) {
  state.selectedNode = node;
  const color    = TYPES[node.type].color;
  const [r, g, b] = TYPES[node.type].rgb;
  const colorDim = `rgba(${r},${g},${b},.13)`;
  document.documentElement.style.setProperty('--node-color',     color);
  document.documentElement.style.setProperty('--node-color-dim', colorDim);
  document.getElementById('node-dot').style.background = color;
  document.getElementById('node-dot').style.boxShadow  = `0 0 8px ${color}`;
  document.getElementById('node-label').textContent    = `Node ${node.id}`;
  document.getElementById('act-mute').classList.toggle('muted', node.muted);
  document.getElementById('act-mute').dataset.tip = node.muted ? 'Unmute' : 'Mute';
  buildTypeButtons(node);
  buildNodeCards(node);
  updateNodeInfoStrip(node);
  globalView.classList.remove('active');
  nodeView.classList.add('active');
}

export function deselectNode() {
  state.selectedNode = null;
  nodeView.classList.remove('active');
  globalView.classList.add('active');
  document.documentElement.style.removeProperty('--node-color');
  document.documentElement.style.removeProperty('--node-color-dim');
}

// ── Analytics strip ───────────────────────────────────────────
export function updateAnalytics() {
  const active = state.nodes.filter(n => !n.muted);
  document.getElementById('an-nodes').textContent = state.nodes.length;

  if (active.length > 0) {
    const freqs = active.map(n => nodeFreq(n)).sort((a, b) => a - b);
    const lo = freqs[0], hi = freqs[freqs.length - 1];
    document.getElementById('an-range').textContent =
      lo === hi ? fmtHz(lo) : `${fmtHz(lo)}–${fmtHz(hi)}`;
  } else {
    document.getElementById('an-range').textContent = '—';
  }

  let connections = 0;
  for (let i = 0; i < state.nodes.length; i++)
    for (let j = i + 1; j < state.nodes.length; j++)
      if (gravityFactor(state.nodes[i], state.nodes[j]) > .04) connections++;
  document.getElementById('an-conn').textContent = connections;

  if (active.length > 1) {
    const pans   = active.map(n => effectivePan(n));
    const spread = Math.max(...pans) - Math.min(...pans);
    document.getElementById('an-pan').textContent =
      spread < .05 ? 'narrow' : spread < .5 ? 'med' : spread < 1.2 ? 'wide' : 'full';
  } else {
    document.getElementById('an-pan').textContent = active.length === 1
      ? fmtPan(effectivePan(active[0])) : '—';
  }
}

// ── Tooltip ───────────────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');
let tooltipTarget = null;

export function showTooltip(el) {
  if (tooltipTarget === el) return;
  tooltipTarget = el;
  document.getElementById('tip-title').textContent = el.dataset.tip     || '';
  document.getElementById('tip-desc').textContent  = el.dataset.tipDesc || '';
  tooltipEl.style.display = 'block';
  const rect = el.getBoundingClientRect();
  const tw   = tooltipEl.offsetWidth;
  const th   = tooltipEl.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  let top  = rect.bottom + 6;
  if (left < 6) left = 6;
  if (left + tw > innerWidth - 6) left = innerWidth - tw - 6;
  if (top + th > innerHeight - 6) top = rect.top - th - 6;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top  = `${top}px`;
}

export function hideTooltip() {
  tooltipEl.style.display = 'none';
  tooltipTarget = null;
}

// ── What's new overlay ────────────────────────────────────────
const WHATSNEW = {
  '1.9': {
    title: 'UI polish + modular codebase',
    items: [
      { section: 'Typography', changes: ['All text now scales with the large/small text toggle — modals, overlays, wizard, presets, node panel'] },
      { section: 'Mobile panel', changes: ['Node parameter cards can be collapsed with a chevron button — panel shrinks to header + info strip'] },
      { section: 'Under the hood', changes: ['Codebase split into ES modules: store, audio, canvas, ui, main', 'Vite build pipeline — source/ → dist/ via Docker'] },
    ],
  },
  '1.8': {
    title: 'ADSR envelope per node',
    items: [
      { section: 'Envelope', changes: ['Attack — fade-in time (10ms – 10s)', 'Decay — fall to sustain level', 'Sustain — held amplitude level (%)', 'Release — fade-out time when stopped or muted'] },
      { section: 'Behaviour', changes: ['Mute now triggers release instead of instant silence', 'Play triggers attack through the full ADSR curve', 'Envelope parameters saved in presets'] },
    ],
  },
  '1.7': {
    title: 'Bigger UI + hamburger + per-node delay',
    items: [
      { section: 'Interface', changes: ['Buttons increased 1.5× for easier tapping', 'Mobile: all controls hidden in hamburger menu (☰)', 'Orientation change no longer breaks canvas tap area'] },
      { section: 'Per-node controls', changes: ['Filter cutoff slider — direct control of the lowpass filter', 'Delay Time — local echo delay per node (10–1000ms)', 'Delay Feedback — echo repeat amount', 'Delay Wet — local echo mix (independent of master delay bus)'] },
    ],
  },
  '1.6': {
    title: 'Canvas zoom',
    items: [
      { section: 'Zoom', changes: ['Scroll wheel zooms in/out toward cursor', 'Pinch gesture on touch devices', 'Zoom range ×0.25 – ×4', 'Zoom level shown in corner indicator'] },
      { section: 'Filter stability', changes: ['Node filter frequency no longer changes when window is resized or zoomed', 'Filter position is now stored on the node, not derived from canvas size'] },
    ],
  },
  '1.5': {
    title: 'FX chain + frequency response',
    items: [
      { section: 'Master FX (⚌ button)', changes: ['Lo Cut — highpass filter removes low rumble', 'Hi Cut — lowpass filter trims harsh highs', 'Reverb — room/space effect with wet + decay controls', 'Delay — echo with time, feedback and wet mix'] },
      { section: 'Per-node effects', changes: ['Reverb Send — routes this node into the reverb bus', 'Delay Send — routes this node into the delay bus', 'Both appear as cards in the node panel'] },
      { section: 'Frequency response (ЧКХ)', changes: ['Spectrum canvas shows real-time FFT curves when playing', 'Each node drawn in its own color', 'White curve = combined master output', 'dB grid lines at −30/−60/−90 dB'] },
    ],
  },
  '1.4': {
    title: 'Settings persist + dark theme',
    items: [
      { section: 'Dark theme by default', changes: ['App now opens in dark mode', 'Theme choice is saved and restored on every visit'] },
      { section: 'Settings persistence', changes: ['Volume, Gravity, Tone, Spread saved automatically', 'Large text toggle remembered across sessions', 'All UI preferences restored on reload'] },
      { section: 'Audio improvements', changes: ['Larger audio buffer (300ms) reduces glitches under CPU load', 'Canvas capped at 30fps with adaptive wave ring count'] },
      { section: 'Pan fix', changes: ['Stereo pan is now slider-only — no longer tied to node X position'] },
    ],
  },
  '1.3': {
    title: 'Background audio + onboarding',
    items: [
      { section: 'Background audio', changes: ['Sound continues when screen locks (iOS/Android)', 'Lock screen controls via MediaSession API'] },
      { section: 'Onboarding wizard', changes: ['10-step tour covers every interface element', '"?" button reopens the wizard at any time', 'Wizard blocks UI until dismissed'] },
    ],
  },
};

export function showWhatsNew(version) {
  const data = WHATSNEW[version];
  if (!data) return;
  document.getElementById('whatsnew-version-badge').textContent = `v${version}`;
  const body = document.getElementById('whatsnew-body');
  body.innerHTML = data.items.map(s =>
    `<h4>${s.section}</h4><ul>${s.changes.map(c => `<li>${c}</li>`).join('')}</ul>`
  ).join('');
  document.getElementById('whatsnew-overlay').classList.add('open');
}

// ── Onboarding wizard ─────────────────────────────────────────
const WIZARD_STEPS = [
  { icon: '✦', title: 'Welcome to Noisen', highlight: null,
    body: 'A generative sound canvas. No presets to browse, no menus to dig through — you draw sound by placing nodes directly on screen. Every position is a unique sonic texture. Tap anywhere on the dark canvas to place your first node.' },
  { icon: '↔', title: 'X axis = frequency', highlight: 'main',
    body: 'The horizontal position of a node sets its pitch. Far left → deep sub-bass (8 Hz). Far right → ultrasonic highs (40 kHz). The scale is logarithmic, so the middle of the canvas sits around 600 Hz — the heart of the human voice range. Drag a node left or right and hear the pitch sweep continuously.' },
  { icon: '↕', title: 'Y axis = filter brightness', highlight: 'main',
    body: 'Vertical position controls a low-pass filter cutoff. Top of canvas → filter fully open, full harmonic content. Bottom → filter almost closed, leaving only a muffled low rumble. Combine a high-pitched node placed low on the canvas for a dark, filtered sine tone — very different from the same note placed high.' },
  { icon: '◎', title: 'Gravity between nodes', highlight: 'grav',
    body: 'Nodes pull each other\'s pitch. The closer two nodes are, the stronger the gravitational attraction — their frequencies drift toward each other. With high gravity, a cluster of nodes converges into a single drone. Low gravity preserves independence. Use the Gravity slider in the panel to tune how strongly nodes interact.' },
  { icon: '◈', title: 'Wave types & node panel', highlight: null,
    body: 'Tap any node to open its panel. Five wave types: Sine (pure tone), Triangle (soft and hollow), Square (buzzy, hollow), Sawtooth (bright, rich), Noise (textural — white, pink, or brown). Each type has unique parameters: detune in cents, vibrato rate and depth for oscillators, voice stacking and spread for square/sawtooth, resonance Q for noise.' },
  { icon: '⟳', title: 'Pan & stereo field', highlight: null,
    body: 'A node\'s horizontal world position also sets its stereo pan automatically — left side of canvas = left speaker, right side = right speaker. You can override this per node in the panel with a manual pan slider. The stereo field is audible even on headphones with a single node by placing it anywhere but center.' },
  { icon: '▶', title: 'Play button', highlight: 'play-btn',
    body: 'The ▶ button in the top bar starts audio. On iOS, audio requires this first tap to unlock the Web Audio context — after that it plays silently even with the mute switch on. Press again to stop. Node positions, types, and parameters are preserved — press play again to resume exactly as you left it.' },
  { icon: '⚄', title: 'Random harmonic generator', highlight: 'random-btn',
    body: 'The shuffle button generates a full configuration from a random musical scale: Major, Natural Minor, Pentatonic, Minor Pentatonic, Dorian, Mixolydian, Lydian, or Phrygian. Nodes land precisely on note frequencies for that root and scale. Gravity is kept light so intervals stay recognisable. Hit it repeatedly — each result is unique.' },
  { icon: '💾', title: 'Save & share presets', highlight: 'presets-btn',
    body: 'The floppy icon opens the Presets panel. Name your configuration and save it to this device (localStorage). The share button generates a URL — the entire state is encoded in the link as compressed base64. Anyone who opens the link gets your exact nodes, types, volumes, and global parameters. No server, no account.' },
  { icon: '∞', title: 'Infinite canvas', highlight: 'reset-view',
    body: 'The workspace is infinite — drag the background to pan. Momentum carries the view after you release. Use the crosshair button in the toolbar to snap back to the origin. The frequency scale is fixed regardless of screen size or zoom — a node at world X = 960 is always 220 Hz (A3), on any device.' },
];

let wizardStep   = 0;
let wizardRingEl = null;

function wizardSetRing(elementId) {
  if (wizardRingEl) wizardRingEl.classList.remove('wizard-ring');
  wizardRingEl = elementId ? document.getElementById(elementId) : null;
  if (wizardRingEl) wizardRingEl.classList.add('wizard-ring');
}

function wizardRender() {
  const step  = WIZARD_STEPS[wizardStep];
  const total = WIZARD_STEPS.length;
  const bar   = document.getElementById('wiz-bar');
  bar.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const pip = document.createElement('div');
    pip.className = 'wiz-pip' + (i < wizardStep ? ' done' : i === wizardStep ? ' active' : '');
    bar.appendChild(pip);
  }
  document.getElementById('wiz-icon').textContent  = step.icon;
  document.getElementById('wiz-title').textContent = step.title;
  document.getElementById('wiz-body').textContent  = step.body;
  document.getElementById('wiz-next').textContent  = wizardStep === total - 1 ? 'Let\'s go ✓' : 'Next →';
  document.getElementById('wiz-prev').style.visibility = wizardStep === 0 ? 'hidden' : 'visible';
  wizardSetRing(step.highlight);
}

export function wizardOpen() {
  const el = document.getElementById('wizard');
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.remove('hide'));
  wizardStep = 0;
  wizardRender();
}

export function wizardClose() {
  const el = document.getElementById('wizard');
  el.classList.add('hide');
  wizardSetRing(null);
  setTimeout(() => { el.style.display = 'none'; }, 260);
  localStorage.setItem('noisen-wizard-done', '1');
}

export function initWizard() {
  document.getElementById('wiz-next').addEventListener('click', () => {
    if (wizardStep < WIZARD_STEPS.length - 1) { wizardStep++; wizardRender(); }
    else wizardClose();
  });
  document.getElementById('wiz-prev').addEventListener('click', () => {
    if (wizardStep > 0) { wizardStep--; wizardRender(); }
  });
  document.getElementById('wiz-skip').addEventListener('click', wizardClose);
  document.getElementById('help-btn').addEventListener('click', wizardOpen);
  document.getElementById('help-btn-m')?.addEventListener('click', wizardOpen);

  if (!localStorage.getItem('noisen-wizard-done')) {
    wizardRender();
  } else {
    document.getElementById('wizard').style.display = 'none';
  }
}

// ── Nodes overview overlay ────────────────────────────────────
export function openNodesOverlay() {
  buildNodesOverlay();
  document.getElementById('nodes-overlay').classList.add('open');
}

export function closeNodesOverlay() {
  document.getElementById('nodes-overlay').classList.remove('open');
}

function buildNodesOverlay() {
  const list = document.getElementById('nodes-list');
  list.innerHTML = '';
  if (state.nodes.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:24px;text-align:center;font-size:11px;color:var(--text-faint)';
    empty.textContent = 'No nodes yet — tap the canvas to create one';
    list.appendChild(empty);
    return;
  }
  for (const node of state.nodes) {
    const freq   = nodeFreq(node);
    const filter = filterFromNorm(node.filterNorm ?? 0.5);
    const row    = document.createElement('div');
    row.className = 'node-row';
    if (node.muted) row.style.opacity = '.52';
    row.innerHTML = `
      <div class="node-row-dot" style="background:${TYPES[node.type].color}"></div>
      <span class="node-row-id">#${node.id}</span>
      <span class="node-row-icon">${WAVE_ICONS[node.type]}</span>
      <span class="node-row-type">${node.type}</span>
      <span class="node-row-freq">${fmtHz(freq)}</span>
      <span class="node-row-filter">↓${fmtHz(filter)}</span>
      <span class="node-row-vol">${Math.round(node.volume * 100)}%</span>
      ${node.muted ? '<span class="node-row-muted-tag">muted</span>' : ''}
    `;
    row.addEventListener('click', () => { selectNode(node); closeNodesOverlay(); });
    list.appendChild(row);
  }
}

// ── FX overlay ────────────────────────────────────────────────
function fmtLocut(v) {
  const hz = locutHz(v);
  return hz < 100 ? `${Math.round(hz)}Hz` : `${(hz / 1000).toFixed(2)}kHz`;
}
function fmtHicut(v) {
  const hz = hicutHz(v);
  return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}kHz`;
}

export function initFxOverlay() {
  document.getElementById('fx-locut').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    locut.frequency.rampTo(locutHz(v), .1);
    document.getElementById('fx-locut-val').textContent = v < 1 ? '20Hz' : fmtLocut(v);
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-hicut').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    hiCut.frequency.rampTo(hicutHz(v), .1);
    document.getElementById('fx-hicut-val').textContent = v > 99 ? '20kHz' : fmtHicut(v);
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-reverb').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterReverb.wet.rampTo(v / 100, .1);
    document.getElementById('fx-reverb-val').textContent = `${v}%`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-decay').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    const seconds = decaySeconds(v);
    masterReverb.decay = seconds;
    document.getElementById('fx-decay-val').textContent = `${seconds.toFixed(1)}s`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-delay').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterDelay.wet.rampTo(v / 100, .1);
    document.getElementById('fx-delay-val').textContent = `${v}%`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-delaytime').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    const ms = delayMilliseconds(v);
    masterDelay.delayTime.rampTo(ms / 1000, .1);
    document.getElementById('fx-delaytime-val').textContent = `${Math.round(ms)}ms`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fx-feedback').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterDelay.feedback.rampTo(v / 100, .1);
    document.getElementById('fx-feedback-val').textContent = `${v}%`;
    setSliderPct(e.target, v, 0, 90);
  });
}

// ── Presets ───────────────────────────────────────────────────
function encodePreset(preset) {
  const json  = JSON.stringify(preset);
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePreset(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary  = atob(base64);
  const bytes   = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function captureState(name) {
  return {
    name: name || 'Untitled',
    v: 1,
    global: {
      vol:    Math.round(state.masterVolume    * 100),
      grav:   Math.round(state.gravityStrength * 100),
      tone:   Math.round(state.masterTone      * 100),
      spread: Math.round(state.waveSpread      * 100),
    },
    nodes: state.nodes.map(n => ({
      x: Math.round(n.x), y: Math.round(n.y),
      filterNorm: +(n.filterNorm ?? 0.5).toFixed(4),
      type: n.type, volume: n.volume,
      muted: n.muted, panOverride: n.panOverride,
      attack: n.attack ?? 0.3, decay: n.decay ?? 0.1, sustain: n.sustain ?? 100, release: n.release ?? 0.8,
      reverbSend: n.reverbSend ?? 0, delaySend: n.delaySend ?? 0,
      nodeDelayTime: n.nodeDelayTime ?? 250, nodeDelayFeedback: n.nodeDelayFeedback ?? 0, nodeDelayWet: n.nodeDelayWet ?? 0,
      typeParams: { ...n.typeParams },
    })),
  };
}

function getSavedPresets() {
  try { return JSON.parse(localStorage.getItem('noisen-presets') || '[]'); } catch { return []; }
}
function setSavedPresets(list) {
  localStorage.setItem('noisen-presets', JSON.stringify(list));
}

function sharePreset(preset) {
  const url = location.origin + location.pathname + '?p=' + encodePreset(preset);
  navigator.clipboard.writeText(url).catch(() => {});
  const confirm = document.getElementById('share-confirm');
  confirm.style.display = 'block';
  clearTimeout(confirm._timer);
  confirm._timer = setTimeout(() => { confirm.style.display = 'none'; }, 2200);
}

function buildPresetsList() {
  const list  = document.getElementById('presets-list');
  list.innerHTML = '';
  const saved = getSavedPresets();
  if (saved.length === 0) {
    const empty = document.createElement('div');
    empty.className   = 'presets-empty';
    empty.textContent = 'No saved presets yet — set up some nodes and hit Save';
    list.appendChild(empty);
    return;
  }
  for (let i = 0; i < saved.length; i++) {
    const preset = saved[i];
    const row    = document.createElement('div');
    row.className = 'preset-row';
    row.innerHTML = `
      <span class="preset-row-name">${preset.name}</span>
      <span class="preset-row-nodes">${preset.nodes.length} node${preset.nodes.length !== 1 ? 's' : ''}</span>
      <button class="preset-row-share" title="Share">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
      <button class="preset-row-load">Load</button>
      <button class="preset-row-del">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    `;
    // load/share/delete wired in main.js via applyPreset
    row.querySelector('.preset-row-load').addEventListener('click', () => {
      applyPresetExternal(preset);
      closePresetsOverlay();
    });
    row.querySelector('.preset-row-share').addEventListener('click', () => sharePreset(preset));
    row.querySelector('.preset-row-del').addEventListener('click', () => {
      const updated = getSavedPresets().filter((_, j) => j !== i);
      setSavedPresets(updated);
      buildPresetsList();
    });
    list.appendChild(row);
  }
}

// set by main.js to avoid circular dependency
let applyPresetExternal = () => {};
export function registerApplyPreset(fn) { applyPresetExternal = fn; }

export function openPresetsOverlay() {
  document.getElementById('preset-name-input').value = '';
  document.getElementById('share-confirm').style.display = 'none';
  buildPresetsList();
  document.getElementById('presets-overlay').classList.add('open');
}

export function closePresetsOverlay() {
  document.getElementById('presets-overlay').classList.remove('open');
}

export function initPresetsOverlay() {
  document.getElementById('presets-btn').addEventListener('click', openPresetsOverlay);
  document.getElementById('presets-overlay-close').addEventListener('click', closePresetsOverlay);
  document.getElementById('presets-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePresetsOverlay();
  });
  document.getElementById('preset-save-btn').addEventListener('click', () => {
    const name   = document.getElementById('preset-name-input').value.trim() || 'Untitled';
    const preset = captureState(name);
    const list   = getSavedPresets();
    list.unshift(preset);
    setSavedPresets(list);
    buildPresetsList();
    document.getElementById('preset-name-input').value = '';
  });
  document.getElementById('preset-share-current-btn').addEventListener('click', () => {
    sharePreset(captureState(document.getElementById('preset-name-input').value.trim() || 'Shared'));
  });
}
