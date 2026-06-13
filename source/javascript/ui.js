// ── UI: panels, overlays, tooltips, toasts, wizard, presets ──

import {
  state, APP_VERSION, TYPES, TYPE_DEFAULTS, DRUM_TYPES, DRUM_ICONS, WAVE_ICONS, PARAM_ICONS,
  ORBIT_TARGETS, ORBIT_DEFAULTS,
  saveSettings, loadSettings,
} from './store.js';
import {
  nodeFreq, filterFromNorm, effectivePan, gravityFactor, gravityPull,
  createAudio, destroyAudio, updateAudio, rebuildAudio,
  masterGain, masterFilter, masterReverb, masterDelay, locut, hiCut,
  locutHz, hicutHz, decaySeconds, delayMilliseconds, toneHz,
  syncOrbitLFO, syncDrumOrbitLFO,
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
  if (state.isPlaying) masterGain.gain.rampTo(state.masterVolume, 0.05);
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

function makeNoiseColorCard(node, onColorChange = null) {
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
      onColorChange?.(btn.dataset.c);
    });
  });
  return card;
}

// ── Node tab state ────────────────────────────────────────────
let activeNodeTab = 'sound';

function switchNodeTab(tab) {
  activeNodeTab = tab;
  document.querySelectorAll('.node-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  if (state.selectedNode) buildNodeCards(state.selectedNode);
}

// Wire tab buttons once on load
document.querySelectorAll('.node-tab').forEach(btn => {
  btn.addEventListener('click', () => switchNodeTab(btn.dataset.tab));
});

// targetLabelOverrides: { filter: 'Pitch', delay: 'Decay' } for drum nodes
function buildOrbitSection(node, container, syncFn, targetLabelOverrides = {}, defaultTarget = 'filter') {
  const broadcastOrbits = (orbits) => {
    window.__sessionBroadcast?.('node_param', { id: node.id, key: 'orbits', value: orbits, rebuild: false });
    window.__scheduleAutosave?.();
  };
  const orbitSection = document.createElement('div');
  orbitSection.className = 'orbit-section';
  orbitSection.innerHTML = `<div class="orbit-section-header">
    <span class="orbit-section-title">Orbits</span>
    <button class="orbit-add-btn" ${(node.orbits?.length ?? 0) >= 5 ? 'disabled' : ''}>+ Add</button>
  </div>`;
  if (!node.orbits) node.orbits = [];

  const renderOrbitCards = () => {
    const existing = orbitSection.querySelector('.orbit-cards');
    if (existing) existing.remove();
    const cards = document.createElement('div');
    cards.className = 'orbit-cards';
    node.orbits.forEach((orbit, index) => {
      const colors = ['#78c8ff', '#ffb450', '#8cffa0'];
      const card = document.createElement('div');
      card.className = 'orbit-card';
      card.style.setProperty('--orbit-color', colors[index % colors.length]);
      card.innerHTML = `
        <div class="orbit-card-header">
          <span class="orbit-dot" style="background:${colors[index % colors.length]}"></span>
          <div class="orbit-target-btns">
            ${ORBIT_TARGETS.map(t => `<button class="orbit-target-btn ${orbit.target === t.id ? 'active' : ''}" data-target="${t.id}">${targetLabelOverrides[t.id] ?? t.label}</button>`).join('')}
          </div>
          <button class="orbit-dir-btn" title="Direction">${(orbit.direction ?? 1) === 1 ? '↻' : '↺'}</button>
          <button class="orbit-toggle ${orbit.enabled ? 'on' : ''}" title="Enable/disable">${orbit.enabled ? '●' : '○'}</button>
          <button class="orbit-remove-btn" title="Remove">✕</button>
        </div>
        <div class="orbit-sliders">
          <div class="orbit-slider-row">
            <span class="orbit-slider-label">Rate</span>
            <input type="range" class="card-slider orbit-rate" min="0.02" max="2" step="0.01" value="${orbit.rate}" style="--pct:${((orbit.rate - 0.02) / 1.98 * 100).toFixed(1)}%">
            <span class="orbit-slider-val orbit-rate-val">${orbit.rate.toFixed(2)}Hz</span>
          </div>
          <div class="orbit-slider-row">
            <span class="orbit-slider-label">Depth</span>
            <input type="range" class="card-slider orbit-depth" min="0" max="100" step="1" value="${orbit.depth}" style="--pct:${orbit.depth}%">
            <span class="orbit-slider-val orbit-depth-val">${orbit.depth}%</span>
          </div>
        </div>`;
      card.querySelector('.orbit-dir-btn').addEventListener('click', e => {
        orbit.direction = (orbit.direction ?? 1) === 1 ? -1 : 1;
        e.target.textContent = orbit.direction === 1 ? '↻' : '↺';
        syncFn(index);
        broadcastOrbits?.(node.orbits);
      });
      card.querySelector('.orbit-toggle').addEventListener('click', () => {
        orbit.enabled = !orbit.enabled;
        syncFn(index);
        broadcastOrbits?.(node.orbits);
        renderOrbitCards();
      });
      card.querySelector('.orbit-remove-btn').addEventListener('click', () => {
        node.orbits.splice(index, 1);
        syncFn(index);
        broadcastOrbits?.(node.orbits);
        orbitSection.querySelector('.orbit-add-btn').disabled = node.orbits.length >= 5;
        renderOrbitCards();
      });
      card.querySelectorAll('.orbit-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          orbit.target = btn.dataset.target;
          syncFn(index);
          broadcastOrbits?.(node.orbits);
          card.querySelectorAll('.orbit-target-btn').forEach(b => b.classList.toggle('active', b.dataset.target === orbit.target));
        });
      });
      card.querySelector('.orbit-rate').addEventListener('input', e => {
        orbit.rate = parseFloat(e.target.value);
        card.querySelector('.orbit-rate-val').textContent = `${orbit.rate.toFixed(2)}Hz`;
        setSliderPct(e.target, orbit.rate, 0.02, 2);
        syncFn(index);
        broadcastOrbits?.(node.orbits);
      });
      card.querySelector('.orbit-depth').addEventListener('input', e => {
        orbit.depth = parseInt(e.target.value);
        card.querySelector('.orbit-depth-val').textContent = `${orbit.depth}%`;
        setSliderPct(e.target, orbit.depth, 0, 100);
        syncFn(index);
        broadcastOrbits?.(node.orbits);
      });
      cards.appendChild(card);
    });
    orbitSection.appendChild(cards);
  };

  orbitSection.querySelector('.orbit-add-btn').addEventListener('click', () => {
    if (node.orbits.length >= 5) return;
    const usedTargets = node.orbits.map(o => o.target);
    const newOrbit = ORBIT_DEFAULTS();
    if (!usedTargets.includes(defaultTarget)) {
      newOrbit.target = defaultTarget;
    } else {
      const next = ORBIT_TARGETS.find(t => !usedTargets.includes(t.id));
      newOrbit.target = next ? next.id : defaultTarget;
    }
    node.orbits.push(newOrbit);
    syncFn(node.orbits.length - 1);
    broadcastOrbits?.(node.orbits);
    orbitSection.querySelector('.orbit-add-btn').disabled = node.orbits.length >= 5;
    renderOrbitCards();
  });

  renderOrbitCards();
  container.appendChild(orbitSection);
}

function buildDrumSequencer(node, container, color) {
  const broadcastSteps = (steps) => {
    window.__sessionBroadcast?.('node_param', { id: node.id, key: 'steps', value: steps, rebuild: false });
    window.__scheduleAutosave?.();
  };
  const steps = (node.steps = node.steps ?? Array(16).fill(false));

  const sequencer = document.createElement('div');
  sequencer.className = 'drum-sequencer';
  sequencer.style.setProperty('--drum-color', color);

  const makeRow = (from, count) => {
    const row = document.createElement('div');
    row.className = 'drum-step-row';
    row.style.gridTemplateColumns = `repeat(${count}, 1fr)`;
    for (let i = from; i < from + count; i++) {
      const btn = document.createElement('button');
      btn.className = 'drum-step' + (steps[i] ? ' on' : '') + (i % 4 === 0 ? ' downbeat' : '');
      btn.dataset.step = i;
      btn.addEventListener('click', () => {
        steps[i] = !steps[i];
        btn.classList.toggle('on', steps[i]);
        broadcastSteps?.(steps);
      });
      row.appendChild(btn);
    }
    return row;
  };

  // always two rows of 8 for consistent tap target size
  sequencer.appendChild(makeRow(0, 8));
  sequencer.appendChild(makeRow(8, 8));

  container.appendChild(sequencer);

  let lastHighlighted = -1;
  function tickHighlight() {
    if (!container.isConnected) return;
    const step = state.beatStep;
    if (step !== lastHighlighted) {
      container.querySelectorAll('.drum-step').forEach((b, i) => b.classList.toggle('playing', i === step));
      lastHighlighted = step;
    }
    requestAnimationFrame(tickHighlight);
  }
  requestAnimationFrame(tickHighlight);
}

export function buildNodeCards(node) {
  nodeCards.innerHTML = '';
  const color    = TYPES[node.type].color;
  const [r, g, b] = TYPES[node.type].rgb;
  const colorDim = `rgba(${r},${g},${b},.12)`;

  nodeCards.style.setProperty('--card-accent',     color);
  nodeCards.style.setProperty('--card-accent-dim', colorDim);

  // Broadcast param change to session peers via the bridge set in main.js.
  // rebuild=true signals the receiver must call rebuildAudio instead of updateAudio.
  const s = (key, value, rebuild = false) => {
    window.__sessionBroadcast?.('node_param', { id: node.id, key, value, rebuild });
    window.__scheduleAutosave?.();
  };

  const mkC = (id, iconKey, label, tip, tipDesc, min, max, step, val, fmt, onChange) =>
    makeCard({ id, icon: PARAM_ICONS[iconKey] || iconKey, label, tip, tipDesc, min, max, step, value: val, fmt, onChange });

  const fmtSec = v => v >= 1 ? `${(+v).toFixed(1)}s` : `${Math.round(v * 1000)}ms`;
  const fmtMs  = v => `${Math.round(v * 1000)}ms`;
  const fmtPct = v => `${Math.round(v * 100)}%`;

  // ── Relabel Envelope tab for drum nodes ──────────────────────
  const envTabBtn = document.querySelector('.node-tab[data-tab="envelope"]');
  if (envTabBtn) envTabBtn.textContent = DRUM_TYPES.has(node.type) ? 'Steps' : 'Envelope';

  // ── Drum node: full tabbed panel ─────────────────────────────
  if (DRUM_TYPES.has(node.type)) {
    const params = node.typeParams ?? {};
    if (activeNodeTab === 'sound') {
      nodeCards.appendChild(mkC('vol','vol','Volume','Node volume','Loudness and visual size',
        5,100,1,Math.round(node.volume*100),v=>`${v}%`,v=>{ node.volume=v/100; s('volume',v/100); }));
      nodeCards.appendChild(mkC('pan','pan','Pan','Stereo pan','Left/right position in stereo field',
        -100,100,1,Math.round((node.panOverride??0)*100),v=>fmtPan(v/100),v=>{ node.panOverride=v/100; s('panOverride',v/100); }));
      if (node.type === 'kick') {
        nodeCards.appendChild(mkC('tune','tune','Tune','Pitch','Fundamental frequency of the kick',
          20,200,1,params.tune??60,v=>`${Math.round(v)}Hz`,v=>{ params.tune=v; s('typeParams.tune',v); }));
        nodeCards.appendChild(mkC('dcy','dcy','Decay','Decay time','Envelope length',
          0.02,1.5,0.01,params.decay??0.35,fmtMs,v=>{ params.decay=v; s('typeParams.decay',v); }));
        nodeCards.appendChild(mkC('dep','dep','Pitch↓','Pitch fall speed','How fast pitch drops after hit',
          0.01,0.4,0.01,params.pitchDecay??0.07,fmtMs,v=>{ params.pitchDecay=v; s('typeParams.pitchDecay',v); }));
      } else if (node.type === 'snare') {
        nodeCards.appendChild(mkC('dcy','dcy','Decay','Decay time','Envelope length',
          0.02,0.8,0.01,params.decay??0.18,fmtMs,v=>{ params.decay=v; s('typeParams.decay',v); }));
        nodeCards.appendChild(mkC('res','res','Tone','Tone color','Dark (brown) → bright (white) noise',
          0,100,1,Math.round((params.tone??0.5)*100),v=>`${v}%`,v=>{ params.tone=v/100; s('typeParams.tone',v/100); }));
      } else if (node.type === 'hihat') {
        nodeCards.appendChild(mkC('tune','tune','Tune','Frequency','Metal resonance frequency',
          100,6000,50,params.tune??400,v=>`${Math.round(v)}Hz`,v=>{ params.tune=v; s('typeParams.tune',v); }));
        nodeCards.appendChild(mkC('dcy','dcy','Decay','Decay time','Closed hat length',
          0.01,0.5,0.01,params.decay??0.06,fmtMs,v=>{ params.decay=v; s('typeParams.decay',v); }));
        const isOpen = (params.open??0) > 0.5;
        const openCard = mkC('open','vol','Open','Open/closed','Open hat plays full decay',
          0,1,1,isOpen?1:0,v=>v>0.5?'open':'closed',v=>{ params.open=v; s('typeParams.open',v); });
        nodeCards.appendChild(openCard);
      } else if (node.type === 'clap') {
        nodeCards.appendChild(mkC('dcy','dcy','Decay','Decay time','Envelope length',
          0.02,0.6,0.01,params.decay??0.12,fmtMs,v=>{ params.decay=v; s('typeParams.decay',v); }));
        nodeCards.appendChild(mkC('res','res','Tone','Tone color','Dark → bright noise character',
          0,100,1,Math.round((params.tone??0.5)*100),v=>`${v}%`,v=>{ params.tone=v/100; s('typeParams.tone',v/100); }));
      } else if (node.type === 'perc') {
        nodeCards.appendChild(mkC('tune','tune','Tune','Pitch','Metal resonance frequency',
          60,2000,10,params.tune??200,v=>`${Math.round(v)}Hz`,v=>{ params.tune=v; s('typeParams.tune',v); }));
        nodeCards.appendChild(mkC('dcy','dcy','Decay','Decay time','Envelope length',
          0.02,1.0,0.01,params.decay??0.25,fmtMs,v=>{ params.decay=v; s('typeParams.decay',v); }));
      }

    } else if (activeNodeTab === 'envelope') {
      buildDrumSequencer(node, nodeCards, color);

    } else if (activeNodeTab === 'fx') {
      nodeCards.appendChild(mkC('rsnd','rsnd','Reverb','Reverb send','Amount routed to master reverb bus',
        0,100,1,Math.round((node.reverbSend??0)*100),v=>`${v}%`,v=>{ node.reverbSend=v/100; s('reverbSend',v/100); }));
      nodeCards.appendChild(mkC('dsnd','dsnd','Bus Dly','Delay bus send','Amount routed to master delay bus',
        0,100,1,Math.round((node.delaySend??0)*100),v=>`${v}%`,v=>{ node.delaySend=v/100; s('delaySend',v/100); }));

    } else if (activeNodeTab === 'orbits') {
      buildOrbitSection(node, nodeCards, (idx) => syncDrumOrbitLFO(node, idx),
        { filter: 'Pitch', delay: 'Decay', 'delay-time': 'Dly Snd', attack: '—', release: '—' }, 'volume');
    }

    nodeCards.querySelectorAll('.param-card').forEach(c => {
      c.style.setProperty('--card-accent',     color);
      c.style.setProperty('--card-accent-dim', colorDim);
    });
    return;
  }

  if (activeNodeTab === 'sound') {
    nodeCards.appendChild(mkC('vol','vol','Volume','Node volume','Loudness and visual size',
      5,100,1,Math.round(node.volume*100),v=>`${v}%`,v=>{ node.volume=v/100; updateAudio(node); s('volume',v/100); }));
    nodeCards.appendChild(mkC('pan','pan','Pan','Stereo pan','Left/right, overrides X-axis',
      -100,100,1,Math.round(effectivePan(node)*100),v=>fmtPan(v/100),v=>{ node.panOverride=v/100; updateAudio(node); s('panOverride',v/100); }));
    nodeCards.appendChild(mkC('fcut','fcut','Filter','Filter cutoff','Lowpass cutoff frequency',
      0,100,1,Math.round((node.filterNorm??0.5)*100),v=>`${Math.round(filterFromNorm(v/100))}Hz`,v=>{ node.filterNorm=v/100; updateAudio(node); s('filterNorm',v/100); }));
    if (node.type === 'sine' || node.type === 'triangle') {
      nodeCards.appendChild(mkC('det','det','Detune','Detune','Fine pitch in cents',-1200,1200,1,node.typeParams.detune,v=>`${v}¢`,v=>{ node.typeParams.detune=v; updateAudio(node); s('typeParams.detune',v); }));
      nodeCards.appendChild(mkC('vib','vib','Vibrato Hz','Vibrato rate','LFO speed',0,20,.1,node.typeParams.vibratoRate,v=>`${(+v).toFixed(1)}Hz`,v=>{ node.typeParams.vibratoRate=v; rebuildAudio(node); s('typeParams.vibratoRate',v,true); }));
      nodeCards.appendChild(mkC('dep','dep','Vib depth','Vibrato depth','Depth in cents',0,400,1,node.typeParams.vibratoDepth,v=>`${v}¢`,v=>{ node.typeParams.vibratoDepth=v; rebuildAudio(node); s('typeParams.vibratoDepth',v,true); }));
    } else if (node.type === 'square' || node.type === 'sawtooth') {
      nodeCards.appendChild(mkC('det','det','Detune','Detune','Fine pitch in cents',-1200,1200,1,node.typeParams.detune,v=>`${v}¢`,v=>{ node.typeParams.detune=v; updateAudio(node); s('typeParams.detune',v); }));
      nodeCards.appendChild(mkC('vcs','vcs','Voices','Voices','Detuned copies',1,5,1,node.typeParams.voices,v=>`×${v}`,v=>{ node.typeParams.voices=v; rebuildAudio(node); s('typeParams.voices',v,true); }));
      nodeCards.appendChild(mkC('spr','spr','Spread','Spread','Cents between voices',0,100,1,node.typeParams.spread,v=>`${v}¢`,v=>{ node.typeParams.spread=v; rebuildAudio(node); s('typeParams.spread',v,true); }));
    } else if (node.type === 'noise') {
      nodeCards.appendChild(makeNoiseColorCard(node, (c) => s('typeParams.color', c, true)));
      nodeCards.appendChild(mkC('res','res','Resonance','Resonance','Filter Q',.5,20,.5,node.typeParams.resonance,v=>`Q${(+v).toFixed(1)}`,v=>{ node.typeParams.resonance=v; updateAudio(node); s('typeParams.resonance',v); }));
    }

  } else if (activeNodeTab === 'envelope') {
    nodeCards.appendChild(mkC('atk','atk','Attack','Envelope attack','Fade-in time',
      0.01,10,.01,node.attack??0.3,fmtSec,v=>{ node.attack=+v; if(node.audio) node.audio.envelope.attack=+v; s('attack',+v); }));
    nodeCards.appendChild(mkC('dcy','dcy','Decay','Envelope decay','Fall to sustain level',
      0.01,5,.01,node.decay??0.1,fmtSec,v=>{ node.decay=+v; if(node.audio) node.audio.envelope.decay=+v; s('decay',+v); }));
    nodeCards.appendChild(mkC('sus','sus','Sustain','Envelope sustain','Held level',
      0,100,1,node.sustain??100,v=>`${v}%`,v=>{ node.sustain=+v; if(node.audio) node.audio.envelope.sustain=v/100; s('sustain',+v); }));
    nodeCards.appendChild(mkC('rel','rel','Release','Envelope release','Fade-out time',
      0.01,10,.01,node.release??0.8,fmtSec,v=>{ node.release=+v; if(node.audio) node.audio.envelope.release=+v; s('release',+v); }));

  } else if (activeNodeTab === 'fx') {
    nodeCards.appendChild(mkC('rsnd','rsnd','Reverb','Reverb send','Amount routed to master reverb bus',
      0,100,1,Math.round((node.reverbSend??0)*100),v=>`${v}%`,v=>{ node.reverbSend=v/100; if(node.audio) node.audio.reverbSend.gain.rampTo(node.reverbSend,.1); s('reverbSend',v/100); }));
    nodeCards.appendChild(mkC('dsnd','dsnd','Bus Dly','Delay bus send','Amount routed to master delay bus',
      0,100,1,Math.round((node.delaySend??0)*100),v=>`${v}%`,v=>{ node.delaySend=v/100; if(node.audio) node.audio.delaySend.gain.rampTo(node.delaySend,.1); s('delaySend',v/100); }));
    nodeCards.appendChild(mkC('ndly','ndly','Dly Time','Node delay time','Local echo delay in ms',
      10,1000,10,node.nodeDelayTime??250,v=>`${v}ms`,v=>{ node.nodeDelayTime=v; if(node.audio) node.audio.nodeDelay.delayTime.rampTo(v/1000,.1); s('nodeDelayTime',v); }));
    nodeCards.appendChild(mkC('nfdb','nfdb','Dly Fbk','Node delay feedback','Echo repeat amount',
      0,90,1,node.nodeDelayFeedback??0,v=>`${v}%`,v=>{ node.nodeDelayFeedback=v; if(node.audio) node.audio.nodeDelay.feedback.rampTo(v/100,.1); s('nodeDelayFeedback',v); }));
    nodeCards.appendChild(mkC('nwet','nwet','Dly Wet','Node delay wet','Local echo mix',
      0,100,1,node.nodeDelayWet??0,v=>`${v}%`,v=>{ node.nodeDelayWet=v; if(node.audio) node.audio.nodeDelay.wet.rampTo(v/100,.1); s('nodeDelayWet',v); }));

  } else if (activeNodeTab === 'orbits') {
    buildOrbitSection(node, nodeCards, (idx) => syncOrbitLFO(node, idx));
  }

  nodeCards.querySelectorAll('.param-card').forEach(c => {
    c.style.setProperty('--card-accent',     color);
    c.style.setProperty('--card-accent-dim', colorDim);
  });
}

export function buildTypeButtons(node) {
  const row = document.getElementById('type-btns');
  row.innerHTML = '';

  const addBtn = (type) => {
    const btn = document.createElement('button');
    btn.className   = 'type-btn' + (node.type === type ? ' active' : '');
    btn.dataset.tip = type.charAt(0).toUpperCase() + type.slice(1);
    const icon = DRUM_TYPES.has(type) ? DRUM_ICONS[type] : WAVE_ICONS[type];
    btn.innerHTML   = (icon ?? '') + `<span>${type}</span>`;
    btn.addEventListener('click', () => {
      node.type       = type;
      node.typeParams = { ...TYPE_DEFAULTS[type] };
      if (!DRUM_TYPES.has(type)) {
        node.steps = undefined;
        rebuildAudio(node);
      } else {
        node.steps = node.steps ?? Array(16).fill(false);
        destroyAudio(node);
        if (typeof window.__setSelectedDrumType === 'function') window.__setSelectedDrumType(type);
      }
      window.__sessionBroadcast?.('node_type', {
        id: node.id, nodeType: node.type, typeParams: { ...node.typeParams }, steps: node.steps,
      });
      window.__scheduleAutosave?.();
      selectNode(node);
    });
    row.appendChild(btn);
  };

  // ambient types always visible
  ['sine','triangle','square','sawtooth','noise'].forEach(addBtn);

  // drum types shown when beat mode active
  if (state.beatMode) {
    const sep = document.createElement('div');
    sep.className = 'type-sep';
    row.appendChild(sep);
    ['kick','snare','hihat','clap','perc'].forEach(addBtn);
  }
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
  document.getElementById('comet-view')?.classList.remove('active');
  document.getElementById('fx-view')?.classList.remove('active');
  document.getElementById('fx-btn')?.classList.remove('on');
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
  '5.0': {
    title: 'Multiplayer · Full sync · Smarter drums',
    items: [
      { section: 'Multiplayer sessions', changes: [
        'Create a session and share a link — anyone who opens it joins your sound canvas in real time',
        'All parameters sync instantly: volume, filter, orbits, step sequencer, FX sends, node type changes',
        'Session persists across page reloads — rejoins automatically as the same role (host or guest)',
        'Host reconnects to the same session code after reload; guests get a full state sync on join',
        'Copy link button generates a ?s= URL for one-tap mobile sharing',
      ]},
      { section: 'Drum improvements', changes: [
        'New drum nodes get a sensible euclidean step pattern immediately — no more silent nodes on placement',
        'Comets now trigger drum nodes on flyby — orbit a comet through your kit for live percussion',
        'All drum parameters (tune, decay, tone, open/closed) sync to session peers in real time',
        'Drum step grid syncs across multiplayer — tap a step and everyone hears it',
      ]},
      { section: 'Sync coverage', changes: [
        'Global sliders (Volume, Gravity, Tone, Spread) now broadcast to all session peers',
        'Orbit changes (add/remove/rate/depth/target/direction) sync in real time',
        'Node mute and type switching broadcast instantly to all participants',
        'rebuild-audio params (vibrato rate/depth, voices, spread, noise color) sync correctly',
      ]},
    ],
  },
  '4.0': {
    title: 'Master FX panel · Comet controls · Stable canvas',
    items: [
      { section: 'Master FX', changes: [
        'FX panel moved to the bottom bar — tap the FX button to open filter, reverb and delay controls inline',
        'Lo Cut, Hi Cut, Reverb, Decay, Delay, Time and Feedback sliders always accessible without overlay',
      ]},
      { section: 'Comet controls', changes: [
        'Per-comet panel in the bottom bar: orbit size, speed, gravity, shape, fade speed',
        'Permanent mode — toggle a comet to never fade out',
        'Move center — tap anywhere on the canvas to relocate a comet\'s orbit center',
        'Comet shape slider controls the ellipse ratio (circular to stretched)',
        'Comets keep moving when the app tab is in the background',
      ]},
      { section: 'Canvas & layout', changes: [
        'Canvas coordinate space is fixed at startup — rotating the device no longer repositions nodes',
        'Cards in comet and FX panels wrap to two columns in portrait mode so all controls are reachable',
      ]},
    ],
  },
  '3.1': {
    title: 'Comets + audio fixes + drum variety',
    items: [
      { section: 'Comets', changes: [
        'Tap the comet button (☄) to launch a comet on an elliptical orbit through the canvas',
        'Comets have a gravitational field — nodes near the comet visually drift and their filter shifts',
        'Up to 5 comets simultaneously; each fades out after 15–30 seconds',
        'Comet controls in FX panel: Orbit size, Speed, Gravity',
      ]},
      { section: 'Audio', changes: [
        'Fixed click/pop artifacts on play and stop — 20ms master gain fade-in/out',
        'Random BPM on every drum preset: 75–140 BPM depending on the generated kit',
      ]},
      { section: 'Drum variety', changes: [
        'Random drum kits no longer always have kick+snare+hihat+clap — composition is probabilistic',
        'Types can double (two kicks, two hihats); some types may be absent',
        'Six groove styles: four-on-floor, breakbeat, half-time, euclidean, sparse, dense',
        'Drum nodes spawn at type-specific positions (kick=bottom, hihat=top-right) with jitter',
        'Drum orbits randomised per node on every random preset',
      ]},
    ],
  },
  '3.0': {
    title: 'Beat mode — drum sequencer',
    items: [
      { section: 'Beat mode', changes: [
        'New mode activated by the ♩ button in the toolbar — switches the app to rhythmic sequencer mode',
        'BPM control appears when beat mode is active — tap +/− to adjust tempo (60–200 BPM)',
        'Beat mode and ambient mode are independent — switching between them keeps your sound nodes intact',
      ]},
      { section: 'Drum node types', changes: [
        'Five new node types: Kick · Snare · Hihat · Clap · Perc',
        'Drum types appear in the type selector below a divider when beat mode is on',
        'Each drum type has its own color and dedicated synthesis engine (MembraneSynth, NoiseSynth, MetalSynth)',
        'Tap the canvas to place a drum node at any position',
      ]},
      { section: '16-step sequencer', changes: [
        'Every drum node has a compact 16-step grid in its panel',
        'Tap steps to toggle them on/off — active steps light up in the node\'s color',
        'Currently playing step is highlighted with a white outline in real time',
        'Steps are saved as part of the node state',
      ]},
      { section: 'Gravity clustering', changes: [
        'Nodes now attract each other with gaussian falloff — stronger gravity → tighter clusters',
        'Only nearby nodes pull each other; distant nodes are unaffected',
        'Drag any node to reposition; gravity resumes when released',
      ]},
      { section: 'Random presets in beat mode', changes: [
        'Random preset button generates full drum kits when beat mode is active',
        'Four kit styles: four-on-floor · breakbeat · half-time · euclidean polyrhythm',
        'Drum-with-bass variant adds an ambient bass sine layer under the kit',
        'Euclidean algorithm distributes hits evenly across 16 steps',
      ]},
    ],
  },
  '2.3': {
    title: 'Orbit direction + wave physics + changelog',
    items: [
      { section: 'Orbit direction', changes: ['↻ / ↺ button on each orbit — switch between clockwise and counter-clockwise LFO sweep', 'Visual dot on canvas ring follows the chosen direction in real time'] },
      { section: 'Wave rings', changes: ['Ring speed tied to filter openness: bright node → fast ring, dark node → slow ring', 'Expansion decelerates naturally as ring grows — no more mechanical linear spread', 'Emission interval driven by each node\'s own phase oscillation, unique per node'] },
      { section: 'Interface', changes: ['Full changelog accessible from the ? guide — all versions listed', 'Wizard now has a close button (✕) in the top-right corner'] },
    ],
  },
  '2.2': {
    title: 'Rhythmic archetypes + wave physics',
    items: [
      { section: 'New preset archetypes', changes: [
        'Polyrhythm — nodes pulse in integer ratios (1:1.5:2:3, 2:3:5:8…) creating interference rhythms',
        'Gamelan bells — inharmonic high tones with wide panning, like metallophone resonators',
        'Pentatonic pulse — 5 pentatonic voices breathing at independent rates',
        'Fibonacci / φ — frequencies and LFO rates derived from the golden ratio (1.618)',
        'Drone swarm — cluster of micro-detuned unisons beating against each other',
      ]},
      { section: 'Wave rings tied to frequency', changes: [
        'Ripple rings now emit faster for high-frequency nodes, slower for sub-bass',
        'Ring expansion speed also scaled logarithmically with node frequency',
        '20Hz node: ~1 ripple per 1.7s · 2kHz: ~1 per 0.13s',
      ]},
    ],
  },
  '2.1': {
    title: 'Smart presets + fullscreen',
    items: [
      { section: 'Preset archetypes', changes: ['5 intentional archetypes instead of random notes', 'Binaural beats — delta/theta/alpha/beta bands with precise carrier offset', 'Solfeggio — 174, 285, 396, 417, 528, 639, 741, 852, 963 Hz', 'Harmonic series — natural overtone stack over a sub fundamental', 'Full spectrum — sub · bass · mid · air bands simultaneously', 'Scale — musical scale with orbits on each note'] },
      { section: 'Orbits fixed', changes: ['Orbits now actually work — rewrote LFO engine, no more audio dropouts', 'All presets include orbits matched to each node role'] },
      { section: 'Interface', changes: ['Fullscreen button in toolbar', 'Debug panel (⊙ button or Shift+D) — live orbit events + memory stats'] },
    ],
  },
  '2.0': {
    title: 'Orbits + tabbed node panel',
    items: [
      { section: 'Orbit modulation', changes: ['Each node supports up to 3 independent LFO orbits', 'Targets: Filter cutoff, Pan, Volume, Delay wet', 'Rate 0.02–2 Hz · Depth 0–100%', 'Visualised as dashed rings with a moving dot on the canvas'] },
      { section: 'Node panel', changes: ['Parameters split into 4 tabs: Sound · Envelope · FX · Orbits', 'No more endless horizontal scrolling — each tab shows only what matters'] },
    ],
  },
  '1.9': {
    title: 'UI polish + modular codebase',
    items: [
      { section: 'Typography', changes: ['All text now scales with the large/small text toggle — modals, overlays, wizard, presets, node panel'] },
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

export function showChangelog() {
  document.getElementById('whatsnew-version-badge').textContent = 'All versions';
  const body = document.getElementById('whatsnew-body');
  body.innerHTML = Object.entries(WHATSNEW).map(([ver, data]) =>
    `<div class="changelog-version-block">
      <div class="changelog-version-heading"><span class="changelog-ver-badge">v${ver}</span>${data.title}</div>
      ${data.items.map(s => `<h4>${s.section}</h4><ul>${s.changes.map(c => `<li>${c}</li>`).join('')}</ul>`).join('')}
    </div>`
  ).join('');
  document.getElementById('whatsnew-overlay').classList.add('open');
}

// ── Onboarding wizard ─────────────────────────────────────────
const WIZARD_STEPS = [
  { icon: '✦', title: 'Welcome to Noisen', highlight: null,
    image: `<svg viewBox="0 0 352 140" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0d0d20"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="140" fill="url(#wbg)"/><circle cx="88" cy="62" r="36" fill="none" stroke="#3a7bd5" stroke-width=".8" opacity=".18"/><circle cx="88" cy="62" r="16" fill="none" stroke="#3a7bd5" stroke-width="1.6" opacity=".7"/><circle cx="88" cy="62" r="6" fill="#3a7bd5"/><circle cx="176" cy="78" r="48" fill="none" stroke="#a035d8" stroke-width=".8" opacity=".14"/><circle cx="176" cy="78" r="20" fill="none" stroke="#a035d8" stroke-width="1.6" opacity=".65"/><circle cx="176" cy="78" r="8" fill="#a035d8"/><circle cx="272" cy="55" r="30" fill="none" stroke="#1faa88" stroke-width=".8" opacity=".16"/><circle cx="272" cy="55" r="13" fill="none" stroke="#1faa88" stroke-width="1.6" opacity=".7"/><circle cx="272" cy="55" r="5" fill="#1faa88"/><path d="M 20 120 Q 50 108 80 120 Q 110 132 140 120 Q 170 108 200 120 Q 230 132 260 120 Q 290 108 330 120" fill="none" stroke="#3a7bd5" stroke-width="1" opacity=".2"/><text x="176" y="130" font-family="-apple-system,sans-serif" font-size="10" fill="rgba(255,255,255,.25)" text-anchor="middle" letter-spacing=".2em">DRAW SOUND · PLACE NODES · HEAR SPACE</text></svg>`,
    body: 'A generative sound canvas. No accounts, no menus to dig through — you draw sound by placing nodes directly on screen. Every position is a unique sonic texture. Tap anywhere on the dark canvas to place your first node. Use the ? button anytime to reopen this guide.' },

  { icon: '↔', title: 'X axis — frequency', highlight: 'main',
    image: `<svg viewBox="0 0 352 120" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg2" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a1a"/><stop offset="100%" stop-color="#060610"/></radialGradient><linearGradient id="fgrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2244aa" stop-opacity=".5"/><stop offset="50%" stop-color="#3a7bd5" stop-opacity=".3"/><stop offset="100%" stop-color="#88ccff" stop-opacity=".5"/></linearGradient></defs><rect width="352" height="120" fill="url(#wbg2)"/><rect x="20" y="50" width="312" height="3" rx="1.5" fill="url(#fgrad)"/><circle cx="52"  cy="52" r="9"  fill="#2244aa" opacity=".9"/><circle cx="52"  cy="52" r="18" fill="none" stroke="#2244aa" stroke-width="1" opacity=".4"/><circle cx="140" cy="52" r="11" fill="#3a7bd5" opacity=".9"/><circle cx="140" cy="52" r="22" fill="none" stroke="#3a7bd5" stroke-width="1" opacity=".35"/><circle cx="240" cy="52" r="9"  fill="#55aaee" opacity=".9"/><circle cx="240" cy="52" r="18" fill="none" stroke="#55aaee" stroke-width="1" opacity=".35"/><circle cx="316" cy="52" r="7"  fill="#aaddff" opacity=".9"/><circle cx="316" cy="52" r="14" fill="none" stroke="#aaddff" stroke-width="1" opacity=".3"/><text x="52"  y="88" font-family="'SF Mono',monospace" font-size="9"  fill="rgba(255,255,255,.35)" text-anchor="middle">8 Hz</text><text x="140" y="88" font-family="'SF Mono',monospace" font-size="9"  fill="rgba(255,255,255,.35)" text-anchor="middle">200 Hz</text><text x="240" y="88" font-family="'SF Mono',monospace" font-size="9"  fill="rgba(255,255,255,.35)" text-anchor="middle">4 kHz</text><text x="316" y="88" font-family="'SF Mono',monospace" font-size="9"  fill="rgba(255,255,255,.35)" text-anchor="middle">20 kHz</text><text x="20"  y="108" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.2)">← sub-bass</text><text x="332" y="108" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.2)" text-anchor="end">highs →</text></svg>`,
    body: 'Horizontal position sets pitch. Far left → deep sub-bass (8 Hz). Far right → ultrasonic highs (40 kHz). The scale is logarithmic: center canvas ≈ 600 Hz (human voice range). Drag a node left or right and hear the pitch sweep in real time. Frequency is always world-absolute — zooming in doesn\'t change pitch.' },

  { icon: '↕', title: 'Y axis — filter brightness', highlight: 'main',
    image: `<svg viewBox="0 0 352 120" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg3" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a1a"/><stop offset="100%" stop-color="#060610"/></radialGradient><linearGradient id="vgrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ffdd88" stop-opacity=".6"/><stop offset="100%" stop-color="#334488" stop-opacity=".4"/></linearGradient></defs><rect width="352" height="120" fill="url(#wbg3)"/><rect x="170" y="10" width="3" height="100" rx="1.5" fill="url(#vgrad)"/><circle cx="171" cy="22"  r="10" fill="#ffcc44" opacity=".9"/><circle cx="171" cy="22"  r="20" fill="none" stroke="#ffcc44" stroke-width="1" opacity=".3"/><circle cx="171" cy="60"  r="10" fill="#88aadd" opacity=".9"/><circle cx="171" cy="60"  r="20" fill="none" stroke="#88aadd" stroke-width="1" opacity=".3"/><circle cx="171" cy="98"  r="10" fill="#334488" opacity=".9"/><circle cx="171" cy="98"  r="20" fill="none" stroke="#334488" stroke-width="1" opacity=".3"/><text x="196" y="25"  font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,220,100,.7)">open filter — bright, airy</text><text x="196" y="63"  font-family="-apple-system,sans-serif" font-size="9" fill="rgba(150,180,255,.6)">mid filter — balanced</text><text x="196" y="101" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(100,130,200,.5)">closed filter — dark, muffled</text><text x="20" y="18"  font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.2)">top ↑</text><text x="20" y="105" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.2)">↓ bottom</text></svg>`,
    body: 'Vertical position controls a low-pass filter cutoff. Top → filter wide open, full harmonic content. Bottom → filter almost closed, muffled sub-rumble only. A high-pitched node placed low = dark filtered sine. Same node placed high = bright, open tone. Combine both axes to sculpt timbre spatially.' },

  { icon: '◎', title: 'Gravity between nodes', highlight: 'grav',
    image: `<svg viewBox="0 0 352 130" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg4" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#080818"/><stop offset="100%" stop-color="#060610"/></radialGradient><marker id="arr" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="rgba(58,123,213,.55)"/></marker></defs><rect width="352" height="130" fill="url(#wbg4)"/><circle cx="176" cy="65" r="55" fill="none" stroke="#3a7bd5" stroke-width=".5" opacity=".1"/><circle cx="176" cy="65" r="32" fill="none" stroke="#3a7bd5" stroke-width=".5" opacity=".08"/><line x1="58" y1="38" x2="148" y2="60" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="4 5" opacity=".35" marker-end="url(#arr)"/><line x1="294" y1="38" x2="204" y2="60" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="4 5" opacity=".35" marker-end="url(#arr)"/><line x1="58" y1="95" x2="148" y2="70" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="4 5" opacity=".3"  marker-end="url(#arr)"/><line x1="294" y1="95" x2="204" y2="70" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="4 5" opacity=".3"  marker-end="url(#arr)"/><circle cx="58"  cy="38" r="8"  fill="none" stroke="#3a7bd5" stroke-width="1.4" opacity=".7"/><circle cx="58"  cy="38" r="3"  fill="#3a7bd5" opacity=".7"/><circle cx="294" cy="38" r="8"  fill="none" stroke="#3a7bd5" stroke-width="1.4" opacity=".7"/><circle cx="294" cy="38" r="3"  fill="#3a7bd5" opacity=".7"/><circle cx="58"  cy="95" r="7"  fill="none" stroke="#3a7bd5" stroke-width="1.4" opacity=".65"/><circle cx="58"  cy="95" r="3"  fill="#3a7bd5" opacity=".65"/><circle cx="294" cy="95" r="7"  fill="none" stroke="#3a7bd5" stroke-width="1.4" opacity=".65"/><circle cx="294" cy="95" r="3"  fill="#3a7bd5" opacity=".65"/><circle cx="160" cy="62" r="12" fill="none" stroke="#3a7bd5" stroke-width="1.8"/><circle cx="160" cy="62" r="5"  fill="#3a7bd5"/><circle cx="180" cy="68" r="10" fill="none" stroke="#3a7bd5" stroke-width="1.6" opacity=".9"/><circle cx="180" cy="68" r="4"  fill="#3a7bd5" opacity=".9"/><circle cx="172" cy="54" r="8"  fill="none" stroke="#3a7bd5" stroke-width="1.4" opacity=".85"/><circle cx="172" cy="54" r="3"  fill="#3a7bd5" opacity=".85"/><text x="176" y="118" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.25)" text-anchor="middle" letter-spacing=".15em">HIGH GRAVITY → NODES CONVERGE → UNISON DRONE</text></svg>`,
    body: 'Nodes pull each other\'s pitch toward each other. The closer two nodes are, the stronger the pull. High gravity + tight cluster = unison drone as all frequencies converge. Low gravity = each node stays on its own pitch. Use the Gravity slider in the global panel to set how strongly nodes interact. Works while playing in real time.' },

  { icon: '◈', title: 'Node types', highlight: null,
    image: `<svg viewBox="0 0 352 110" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg5" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a1a"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="110" fill="url(#wbg5)"/><text x="36" y="22" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="middle">sine</text><path d="M 16 55 Q 26 35 36 55 Q 46 75 56 55" fill="none" stroke="#3a7bd5" stroke-width="1.8"/><text x="88" y="22" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="middle">triangle</text><path d="M 68 55 L 78 35 L 88 55 L 98 75 L 108 55" fill="none" stroke="#1faa88" stroke-width="1.8"/><text x="148" y="22" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="middle">square</text><path d="M 120 38 L 120 55 L 140 55 L 140 38 L 160 38 L 160 55 L 176 55" fill="none" stroke="#a035d8" stroke-width="1.8"/><text x="214" y="22" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="middle">sawtooth</text><path d="M 188 55 L 200 35 L 200 55 L 212 35 L 212 55 L 224 35 L 224 55 L 236 55" fill="none" stroke="#d87a20" stroke-width="1.8"/><text x="296" y="22" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="middle">noise</text><path d="M 256 55 L 262 42 L 266 60 L 270 38 L 275 65 L 280 48 L 284 58 L 288 40 L 292 62 L 296 50 L 300 58 L 304 44 L 308 60 L 312 52 L 316 58 L 320 55 L 330 55" fill="none" stroke="#cc4444" stroke-width="1.5"/><line x1="16" y1="90" x2="336" y2="90" stroke="rgba(255,255,255,.06)" stroke-width="1"/><text x="176" y="104" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.18)" text-anchor="middle" letter-spacing=".15em">SELECT TYPE IN NODE PANEL · EACH HAS UNIQUE PARAMETERS</text></svg>`,
    body: 'Tap a node to open its panel. Five wave types:\n• Sine — pure tone, single frequency\n• Triangle — soft and hollow, weak overtones\n• Square — buzzy and hollow, odd harmonics only\n• Sawtooth — bright and rich, full harmonic series\n• Noise — textural (white/pink/brown), great for beds\nEach type has unique parameters: detune, vibrato, voice stacking, resonance Q.' },

  { icon: '≋', title: 'Orbits — living modulation', highlight: null,
    image: `<svg viewBox="0 0 352 130" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg6" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0818"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="130" fill="url(#wbg6)"/><ellipse cx="90" cy="62" rx="52" ry="30" fill="none" stroke="#78c8ff" stroke-width="1.1" stroke-dasharray="3 5" opacity=".55"/><ellipse cx="90" cy="62" rx="36" ry="48" fill="none" stroke="#8cffa0" stroke-width="1"   stroke-dasharray="2 6" opacity=".45"/><circle cx="142" cy="62" r="5" fill="#78c8ff" opacity=".85"/><circle cx="90"  cy="14" r="4" fill="#8cffa0" opacity=".75"/><circle cx="90"  cy="62" r="14" fill="none" stroke="#a035d8" stroke-width="1.8"/><circle cx="90"  cy="62" r="6"  fill="#a035d8"/><text x="148" y="60" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(120,200,255,.7)">filter</text><text x="96"  y="12" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(140,255,160,.6)">pan</text><ellipse cx="262" cy="62" rx="60" ry="28" fill="none" stroke="#ffb450" stroke-width="1.1" stroke-dasharray="3 5" opacity=".5"/><circle cx="322" cy="62" r="4.5" fill="#ffb450" opacity=".8"/><circle cx="262" cy="62" r="14" fill="none" stroke="#3a7bd5" stroke-width="1.8"/><circle cx="262" cy="62" r="6"  fill="#3a7bd5"/><text x="328" y="60" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,180,80,.7)">volume</text><text x="176" y="115" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.2)" text-anchor="middle" letter-spacing=".15em">UP TO 3 ORBITS PER NODE · RATE + DEPTH + TARGET</text></svg>`,
    body: 'Every node supports up to 3 independent Orbits — slow LFOs that continuously animate a parameter. Targets: Filter cutoff · Pan (stereo position) · Volume (tremolo) · Delay wet. Set Rate (0.02–2 Hz) and Depth (0–100%). Multiple nodes with different orbit rates create evolving interference textures that never repeat exactly.' },

  { icon: '⟳', title: 'Stereo field', highlight: null,
    image: `<svg viewBox="0 0 352 110" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg7" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a1a"/><stop offset="100%" stop-color="#060610"/></radialGradient><linearGradient id="pangrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#3a7bd5" stop-opacity=".4"/><stop offset="50%" stop-color="rgba(255,255,255,.05)"/><stop offset="100%" stop-color="#a035d8" stop-opacity=".4"/></linearGradient></defs><rect width="352" height="110" fill="url(#wbg7)"/><rect x="20" y="52" width="312" height="2" rx="1" fill="url(#pangrad)"/><text x="22"  y="46" font-family="-apple-system,sans-serif" font-size="10" fill="rgba(100,150,255,.6)">L</text><text x="330" y="46" font-family="-apple-system,sans-serif" font-size="10" fill="rgba(180,100,255,.6)" text-anchor="end">R</text><circle cx="68"  cy="53" r="12" fill="none" stroke="#3a7bd5" stroke-width="1.8"/><circle cx="68"  cy="53" r="5"  fill="#3a7bd5"/><circle cx="68"  cy="53" r="26" fill="none" stroke="#3a7bd5" stroke-width=".6" opacity=".25"/><circle cx="284" cy="53" r="12" fill="none" stroke="#a035d8" stroke-width="1.8"/><circle cx="284" cy="53" r="5"  fill="#a035d8"/><circle cx="284" cy="53" r="26" fill="none" stroke="#a035d8" stroke-width=".6" opacity=".25"/><circle cx="176" cy="53" r="10" fill="none" stroke="#1faa88" stroke-width="1.6"/><circle cx="176" cy="53" r="4"  fill="#1faa88"/><text x="68"  y="82" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(100,150,255,.55)" text-anchor="middle">left speaker</text><text x="284" y="82" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(180,100,255,.55)" text-anchor="middle">right speaker</text><text x="176" y="82" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(80,200,150,.5)" text-anchor="middle">center</text><text x="176" y="102" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.18)" text-anchor="middle" letter-spacing=".1em">POSITION SETS PAN AUTOMATICALLY · OVERRIDE IN PANEL</text></svg>`,
    body: 'A node\'s horizontal position automatically sets its stereo pan — left side = left speaker, right side = right speaker. You can override this per node in the panel. Add a Pan orbit to a node for a slow auto-pan sweep. Two detuned nodes on opposite sides create a lush, wide stereo effect without any effects chain.' },

  { icon: '⚄', title: 'Intelligent preset generator', highlight: 'random-btn',
    image: `<svg viewBox="0 0 352 110" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg8" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a1a"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="110" fill="url(#wbg8)"/><rect x="12"  y="12" width="100" height="44" rx="8" fill="#0d1428" stroke="#3a7bd5" stroke-width=".8" opacity=".9"/><text x="62" y="30" font-family="-apple-system,sans-serif" font-size="9" fill="#6aabff" text-anchor="middle">🧠 Binaural</text><text x="62" y="46" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.3)" text-anchor="middle">delta · theta · alpha</text><rect x="126" y="12" width="100" height="44" rx="8" fill="#0d1a14" stroke="#1faa88" stroke-width=".8" opacity=".9"/><text x="176" y="30" font-family="-apple-system,sans-serif" font-size="9" fill="#44ddaa" text-anchor="middle">✦ Solfeggio</text><text x="176" y="46" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.3)" text-anchor="middle">396 · 528 · 741 Hz</text><rect x="240" y="12" width="100" height="44" rx="8" fill="#18100e" stroke="#d87a20" stroke-width=".8" opacity=".9"/><text x="290" y="30" font-family="-apple-system,sans-serif" font-size="9" fill="#ffaa44" text-anchor="middle">〜 Harmonic</text><text x="290" y="46" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.3)" text-anchor="middle">overtone series</text><rect x="12"  y="64" width="100" height="36" rx="8" fill="#140e20" stroke="#a035d8" stroke-width=".8" opacity=".8"/><text x="62" y="84" font-family="-apple-system,sans-serif" font-size="9" fill="#cc66ff" text-anchor="middle">◈ Fibonacci</text><rect x="126" y="64" width="100" height="36" rx="8" fill="#0e1810" stroke="#44dd88" stroke-width=".8" opacity=".8"/><text x="176" y="84" font-family="-apple-system,sans-serif" font-size="9" fill="#66ffaa" text-anchor="middle">∿ Gamelan</text><rect x="240" y="64" width="100" height="36" rx="8" fill="#180808" stroke="#cc3333" stroke-width=".8" opacity=".8"/><text x="290" y="84" font-family="-apple-system,sans-serif" font-size="9" fill="#ff7777" text-anchor="middle">≈ Drone Swarm</text><text x="176" y="104" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.18)" text-anchor="middle" letter-spacing=".12em">10 ARCHETYPES · HIT SHUFFLE REPEATEDLY · ALWAYS UNIQUE</text></svg>`,
    body: 'The shuffle button picks from 10 scientific archetypes:\n• Binaural beats — delta/theta/alpha/beta brain entrainment\n• Solfeggio — 174, 285, 396, 528 Hz healing frequencies\n• Harmonic series — natural overtone stack\n• Full spectrum — sub · bass · mid · air simultaneously\n• Pentatonic pulse, Polyrhythm, Gamelan bells, Fibonacci, Drone swarm, Scale\nEach archetype bakes in matching orbits. Hit it repeatedly — every result is unique.' },

  { icon: '▶', title: 'Play & audio unlock', highlight: 'play-btn',
    image: `<svg viewBox="0 0 352 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg9" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#08100a"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="100" fill="url(#wbg9)"/><circle cx="176" cy="46" r="34" fill="#0d1f10" stroke="#1faa88" stroke-width="1.5"/><polygon points="168,34 196,46 168,58" fill="#1faa88"/><path d="M 30 75 Q 50 60 70 75 Q 90 90 110 75 Q 130 60 150 75" fill="none" stroke="#1faa88" stroke-width="1" opacity=".25"/><path d="M 202 75 Q 222 60 242 75 Q 262 90 282 75 Q 302 60 322 75" fill="none" stroke="#1faa88" stroke-width="1" opacity=".25"/><text x="176" y="93" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)" text-anchor="middle" letter-spacing=".15em">WORKS ON LOCK SCREEN · PLAYS IN SILENT MODE</text></svg>`,
    body: 'Press ▶ to start audio. On iOS, the first tap unlocks the Web Audio context — after that sound plays even with the mute switch on. All node positions and parameters are preserved when stopped. Lock screen controls work via MediaSession API so you can control playback without unlocking your phone.' },

  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;display:block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>', title: 'Save & share', highlight: 'presets-btn',
    image: `<svg viewBox="0 0 352 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg10" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a18"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="100" fill="url(#wbg10)"/><rect x="20" y="14" width="140" height="72" rx="10" fill="#0d0d20" stroke="#3a7bd5" stroke-width=".8" opacity=".8"/><text x="90" y="36" font-family="-apple-system,sans-serif" font-size="9" fill="rgba(255,255,255,.4)" text-anchor="middle">Binaural Drift</text><text x="90" y="52" font-family="'SF Mono',monospace" font-size="7" fill="rgba(100,150,255,.5)" text-anchor="middle">saved locally</text><rect x="90" y="60" width="60" height="18" rx="6" fill="#1a2040" stroke="#3a7bd5" stroke-width=".8" cx="90"/><text x="120" y="72" font-family="-apple-system,sans-serif" font-size="8" fill="#6aabff" text-anchor="middle">Share ↗</text><rect x="192" y="14" width="140" height="72" rx="10" fill="#0d0d20" stroke="#1faa88" stroke-width=".8" opacity=".8"/><text x="262" y="32" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.3)" text-anchor="middle">noisen.space/?p=</text><text x="262" y="46" font-family="'SF Mono',monospace" font-size="7" fill="rgba(80,200,150,.55)" text-anchor="middle">eJyVkEFuw...</text><text x="262" y="64" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(80,200,150,.4)" text-anchor="middle">full state encoded</text><text x="262" y="78" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(80,200,150,.3)" text-anchor="middle">no server needed</text></svg>`,
    body: 'The floppy icon opens Presets. Save configurations to this device (localStorage). The share button generates a URL — the entire state is encoded as compressed base64. Anyone who opens the link gets your exact nodes, types, volumes, and FX. No server, no account, works offline. QR code is generated automatically for mobile sharing.' },

  { icon: '⌂', title: 'FX chain', highlight: 'fx-btn',
    image: `<svg viewBox="0 0 352 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg11" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a18"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="100" fill="url(#wbg11)"/><g font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.35)"><text x="24"  y="26">Lo Cut</text><text x="24"  y="50">Hi Cut</text><text x="24"  y="74">Reverb</text><text x="120" y="26">Delay</text><text x="120" y="50">Tone</text><text x="120" y="74">Spread</text></g><rect x="70"  y="16" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#3a7bd5" stroke-width=".7"/><rect x="70"  y="16" width="16" height="14" rx="4" fill="#3a7bd5" opacity=".6"/><rect x="70"  y="40" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#3a7bd5" stroke-width=".7"/><rect x="70"  y="40" width="28" height="14" rx="4" fill="#3a7bd5" opacity=".5"/><rect x="70"  y="64" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#a035d8" stroke-width=".7"/><rect x="70"  y="64" width="22" height="14" rx="4" fill="#a035d8" opacity=".5"/><rect x="168" y="16" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#1faa88" stroke-width=".7"/><rect x="168" y="16" width="20" height="14" rx="4" fill="#1faa88" opacity=".5"/><rect x="168" y="40" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#d87a20" stroke-width=".7"/><rect x="168" y="40" width="26" height="14" rx="4" fill="#d87a20" opacity=".5"/><rect x="168" y="64" width="38" height="14" rx="4" fill="#1a1a2e" stroke="#d87a20" stroke-width=".7"/><rect x="168" y="64" width="30" height="14" rx="4" fill="#d87a20" opacity=".45"/><text x="230" y="26" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)">per-node:</text><text x="230" y="42" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)">Reverb Send</text><text x="230" y="58" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)">Delay Send</text><text x="230" y="74" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)">Local Delay</text><text x="176" y="94" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.15)" text-anchor="middle" letter-spacing=".1em">MASTER FX + PER-NODE ROUTING</text></svg>`,
    body: 'The ⚌ button opens the master FX panel:\n• Lo Cut / Hi Cut — shape the overall frequency range\n• Reverb — room size and wet mix\n• Delay — echo with time, feedback, wet\n• Tone, Spread — global timbre and stereo width\nPer-node: each node has its own Reverb Send, Delay Send, and local delay unit — route selectively for depth without affecting other nodes.' },

  { icon: '∞', title: 'Infinite canvas', highlight: 'reset-view',
    image: `<svg viewBox="0 0 352 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg12" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#0a0a18"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="100" fill="url(#wbg12)"/><g opacity=".06" stroke="#7080ee" stroke-width=".6"><line x1="20" y1="20" x2="332" y2="20"/><line x1="20" y1="50" x2="332" y2="50"/><line x1="20" y1="80" x2="332" y2="80"/><line x1="60"  y1="10" x2="60"  y2="90"/><line x1="120" y1="10" x2="120" y2="90"/><line x1="176" y1="10" x2="176" y2="90"/><line x1="232" y1="10" x2="232" y2="90"/><line x1="292" y1="10" x2="292" y2="90"/></g><rect x="60" y="14" width="232" height="72" rx="8" fill="none" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="4 4" opacity=".4"/><text x="176" y="8" font-family="-apple-system,sans-serif" font-size="7" fill="rgba(100,150,255,.4)" text-anchor="middle" letter-spacing=".1em">VIEWPORT</text><circle cx="100" cy="38" r="8" fill="none" stroke="#3a7bd5" stroke-width="1.5"/><circle cx="100" cy="38" r="3" fill="#3a7bd5"/><circle cx="200" cy="55" r="8" fill="none" stroke="#a035d8" stroke-width="1.5"/><circle cx="200" cy="55" r="3" fill="#a035d8"/><circle cx="260" cy="30" r="7" fill="none" stroke="#1faa88" stroke-width="1.5"/><circle cx="260" cy="30" r="3" fill="#1faa88"/><circle cx="24"  cy="65" r="5" fill="none" stroke="#d87a20" stroke-width="1.2" opacity=".5"/><circle cx="316" cy="20" r="5" fill="none" stroke="#3a7bd5" stroke-width="1.2" opacity=".4"/><text x="176" y="94" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.18)" text-anchor="middle" letter-spacing=".12em">PAN · PINCH · SCROLL TO ZOOM · ×0.25–×4</text></svg>`,
    body: 'The workspace is infinite — drag the background to pan, scroll to zoom. Momentum carries the view after release. Use the crosshair button to snap back to origin. Zoom range ×0.25 – ×4. The frequency scale is world-absolute regardless of zoom level — a node at the A3 position is always 220 Hz on any device.' },

  { icon: '⟳', title: 'Multiplayer — share sound live', highlight: 'session-btn',
    image: `<svg viewBox="0 0 352 110" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wbg13" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#080818"/><stop offset="100%" stop-color="#060610"/></radialGradient></defs><rect width="352" height="110" fill="url(#wbg13)"/><rect x="20" y="16" width="130" height="70" rx="10" fill="#0d0d20" stroke="#3a7bd5" stroke-width=".9" opacity=".9"/><circle cx="56"  cy="40" r="8"  fill="none" stroke="#3a7bd5" stroke-width="1.5"/><circle cx="56"  cy="40" r="3"  fill="#3a7bd5"/><circle cx="100" cy="55" r="8"  fill="none" stroke="#a035d8" stroke-width="1.5"/><circle cx="100" cy="55" r="3"  fill="#a035d8"/><circle cx="128" cy="34" r="7"  fill="none" stroke="#1faa88" stroke-width="1.3"/><circle cx="128" cy="34" r="3"  fill="#1faa88"/><text x="85" y="78" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(100,150,255,.5)" text-anchor="middle">Host</text><line x1="150" y1="51" x2="202" y2="51" stroke="#3a7bd5" stroke-width="1" stroke-dasharray="3 4" opacity=".5"/><text x="176" y="48" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.2)" text-anchor="middle">sync</text><rect x="202" y="16" width="130" height="70" rx="10" fill="#0d0d20" stroke="#a035d8" stroke-width=".9" opacity=".9"/><circle cx="238" cy="40" r="8"  fill="none" stroke="#3a7bd5" stroke-width="1.5"/><circle cx="238" cy="40" r="3"  fill="#3a7bd5"/><circle cx="282" cy="55" r="8"  fill="none" stroke="#a035d8" stroke-width="1.5"/><circle cx="282" cy="55" r="3"  fill="#a035d8"/><circle cx="310" cy="34" r="7"  fill="none" stroke="#1faa88" stroke-width="1.3"/><circle cx="310" cy="34" r="3"  fill="#1faa88"/><text x="267" y="78" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(180,100,255,.5)" text-anchor="middle">Guest</text><text x="176" y="102" font-family="-apple-system,sans-serif" font-size="8" fill="rgba(255,255,255,.18)" text-anchor="middle" letter-spacing=".12em">SHARE LINK → INSTANT JOIN → REAL-TIME SYNC</text></svg>`,
    body: 'Tap the session button (↗) to create a shared session. Share the link — anyone who opens it joins your canvas in real time. Every parameter syncs: filter, volume, orbits, step sequences, FX. The session survives page reload — you reconnect automatically. Perfect for live collaboration or remote listening together.' },
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
  document.getElementById('wiz-icon').innerHTML  = step.icon;
  document.getElementById('wiz-title').textContent = step.title;
  document.getElementById('wiz-image').innerHTML   = step.image ?? '';
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
  const checkbox = document.getElementById('wiz-always-show');
  if (checkbox) checkbox.checked = localStorage.getItem('noisen-wizard-always') === '1';
}

export function wizardClose() {
  const el = document.getElementById('wizard');
  el.classList.add('hide');
  wizardSetRing(null);
  setTimeout(() => { el.style.display = 'none'; }, 260);
  const alwaysShow = document.getElementById('wiz-always-show')?.checked;
  if (alwaysShow) {
    localStorage.setItem('noisen-wizard-always', '1');
    localStorage.removeItem('noisen-wizard-done');
  } else {
    localStorage.setItem('noisen-wizard-always', '0');
    localStorage.setItem('noisen-wizard-done', '1');
  }
}

export function initWizard() {
  document.getElementById('wiz-next').addEventListener('click', () => {
    if (wizardStep < WIZARD_STEPS.length - 1) { wizardStep++; wizardRender(); }
    else wizardClose();
  });
  document.getElementById('wiz-prev').addEventListener('click', () => {
    if (wizardStep > 0) { wizardStep--; wizardRender(); }
  });
  document.getElementById('wiz-close').addEventListener('click', wizardClose);
  document.getElementById('wiz-changelog-btn').addEventListener('click', () => {
    wizardClose();
    showChangelog();
  });
  document.getElementById('help-btn').addEventListener('click', wizardOpen);
  document.getElementById('help-btn-m')?.addEventListener('click', wizardOpen);

  const alwaysShow  = localStorage.getItem('noisen-wizard-always') === '1';
  const done        = localStorage.getItem('noisen-wizard-done') === '1';
  const isNewUser   = !done && !alwaysShow;

  if (alwaysShow || isNewUser) {
    wizardRender();
  } else {
    document.getElementById('wizard').style.display = 'none';
  }

  // Export new-user flag so main.js can skip what's-new for first-time visitors.
  window.__isNewUser = isNewUser;
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
  document.getElementById('fxv-locut').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    locut.frequency.rampTo(locutHz(v), .1);
    document.getElementById('fxv-locut-val').textContent = v < 1 ? '20Hz' : fmtLocut(v);
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-hicut').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    hiCut.frequency.rampTo(hicutHz(v), .1);
    document.getElementById('fxv-hicut-val').textContent = v > 99 ? '20kHz' : fmtHicut(v);
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-reverb').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterReverb.wet.rampTo(v / 100, .1);
    document.getElementById('fxv-reverb-val').textContent = `${v}%`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-decay').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    const seconds = decaySeconds(v);
    masterReverb.decay = seconds;
    document.getElementById('fxv-decay-val').textContent = `${seconds.toFixed(1)}s`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-delay').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterDelay.wet.rampTo(v / 100, .1);
    document.getElementById('fxv-delay-val').textContent = `${v}%`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-delaytime').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    const ms = delayMilliseconds(v);
    masterDelay.delayTime.rampTo(ms / 1000, .1);
    document.getElementById('fxv-delaytime-val').textContent = `${Math.round(ms)}ms`;
    setSliderPct(e.target, v, 0, 100);
  });
  document.getElementById('fxv-feedback').addEventListener('input', e => {
    const v = e.target.valueAsNumber;
    masterDelay.feedback.rampTo(v / 100, .1);
    document.getElementById('fxv-feedback-val').textContent = `${v}%`;
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

export function captureState(name, { includeComets = false } = {}) {
  const preset = {
    name: name || 'Untitled',
    v: 1,
    global: {
      vol:    Math.round(state.masterVolume    * 100),
      grav:   Math.round(state.gravityStrength * 100),
      tone:   Math.round(state.masterTone      * 100),
      spread: Math.round(state.waveSpread      * 100),
    },
    isPlaying: state.isPlaying,
    nodes: state.nodes.map(n => ({
      x: Math.round(n.x), y: Math.round(n.y),
      filterNorm: +(n.filterNorm ?? 0.5).toFixed(4),
      type: n.type, volume: n.volume,
      muted: n.muted, panOverride: n.panOverride,
      attack: n.attack ?? 0.3, decay: n.decay ?? 0.1, sustain: n.sustain ?? 100, release: n.release ?? 0.8,
      reverbSend: n.reverbSend ?? 0, delaySend: n.delaySend ?? 0,
      nodeDelayTime: n.nodeDelayTime ?? 250, nodeDelayFeedback: n.nodeDelayFeedback ?? 0, nodeDelayWet: n.nodeDelayWet ?? 0,
      typeParams: { ...n.typeParams },
      orbits: n.orbits ? [...n.orbits] : [],
      steps: n.steps ? [...n.steps] : undefined,
    })),
  };
  if (includeComets && state.comets.length) {
    preset.comets = state.comets.map(c => ({
      id: c.id, cx: c.cx, cy: c.cy, rx: c.rx, ry: c.ry, tilt: c.tilt,
      angle: c.angle, speed: c.speed, mass: c.mass, influence: c.influence,
      color: c.color, size: c.size, life: c.life, maxLife: c.maxLife,
      permanent: c.permanent, fadeSpeed: c.fadeSpeed ?? 1,
      _baseRx: c._baseRx, _baseMass: c._baseMass, _baseInfluence: c._baseInfluence,
    }));
  }
  return preset;
}

const AUTOSAVE_KEY = 'noisen-autosave';
let _autosaveTimer = null;

export function scheduleAutosave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    try {
      const encoded = encodePreset(captureState('autosave'));
      localStorage.setItem(AUTOSAVE_KEY, encoded);
    } catch {}
  }, 1000);
}

export function loadAutosave() {
  try {
    const encoded = localStorage.getItem(AUTOSAVE_KEY);
    return encoded ? decodePreset(encoded) : null;
  } catch { return null; }
}

function getSavedPresets() {
  try { return JSON.parse(localStorage.getItem('noisen-presets') || '[]'); } catch { return []; }
}
function setSavedPresets(list) {
  localStorage.setItem('noisen-presets', JSON.stringify(list));
}

function sharePreset(preset) {
  const longUrl = location.origin + location.pathname + '?p=' + encodePreset(preset);
  // showShareModal is injected from main.js to avoid circular imports
  if (typeof window.__showShareModal === 'function') {
    window.__showShareModal(longUrl);
  } else {
    navigator.clipboard.writeText(longUrl).catch(() => {});
    const confirm = document.getElementById('share-confirm');
    confirm.style.display = 'block';
    clearTimeout(confirm._timer);
    confirm._timer = setTimeout(() => { confirm.style.display = 'none'; }, 2200);
  }
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
