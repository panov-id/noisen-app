// ── Audio engine (Tone.js) ────────────────────────────────────
// Tone.js is loaded via CDN script tag — available as global `Tone`

import { state, TYPES, TYPE_DEFAULTS, WORLD_WIDTH, NODE_MIN_R, NODE_MAX_R } from './store.js';

// ── Orbit LFO helpers ─────────────────────────────────────────
// Each orbit modulates one audio parameter via a sine LFO.
// LFO output range is computed relative to the current param value.

function createOrbitLFO(orbit, node) {
  const audio = node.audio;
  if (!audio) return null;
  const { target, rate, depth } = orbit;
  const d = depth / 100;
  let lfo;

  if (target === 'filter') {
    const base = filterFromNorm(node.filterNorm ?? 0.5);
    lfo = new Tone.LFO({ type: 'sine', frequency: rate, min: base * Math.pow(2, -d * 2), max: base * Math.pow(2, d * 2) });
    lfo.connect(audio.filter.frequency);
  } else if (target === 'pan') {
    const base = effectivePan(node);
    lfo = new Tone.LFO({ type: 'sine', frequency: rate, min: Math.max(-1, base - d), max: Math.min(1, base + d) });
    lfo.connect(audio.panner.pan);
  } else if (target === 'volume') {
    const base = node.volume * 0.28;
    lfo = new Tone.LFO({ type: 'sine', frequency: rate, min: base * (1 - d * 0.9), max: base });
    lfo.connect(audio.gain.gain);
  } else if (target === 'delay') {
    lfo = new Tone.LFO({ type: 'sine', frequency: rate, min: 0, max: d });
    lfo.connect(audio.nodeDelay.wet);
  }

  if (lfo && state.isPlaying && orbit.enabled) lfo.start();
  return lfo;
}

export function createOrbitLFOs(node) {
  if (!node.audio || !node.orbits?.length) return;
  node.audio.orbitLFOs = (node.orbits).map(orbit =>
    orbit.enabled ? createOrbitLFO(orbit, node) : null
  );
}

export function destroyOrbitLFOs(node) {
  if (!node.audio?.orbitLFOs) return;
  for (const lfo of node.audio.orbitLFOs) {
    try { lfo?.stop(); lfo?.disconnect(); } catch {}
  }
  node.audio.orbitLFOs = [];
}

export function syncOrbitLFO(node, index) {
  if (!node.audio) return;
  if (!node.audio.orbitLFOs) node.audio.orbitLFOs = [];
  const old = node.audio.orbitLFOs[index];
  try { old?.stop(); old?.disconnect(); } catch {}
  const orbit = node.orbits?.[index];
  node.audio.orbitLFOs[index] = (orbit?.enabled) ? createOrbitLFO(orbit, node) : null;
}

export function startOrbitLFOs(node) {
  for (const lfo of node.audio?.orbitLFOs ?? []) {
    try { lfo?.start(); } catch {}
  }
}

export function stopOrbitLFOs(node) {
  for (const lfo of node.audio?.orbitLFOs ?? []) {
    try { lfo?.stop(); } catch {}
  }
}

// ── Frequency / filter math ───────────────────────────────────
// World X = 0 → 8Hz, world X = WORLD_WIDTH → ~40kHz; scale is zoom/resize invariant
export function freqFromX(worldX) {
  return Math.pow(2, (worldX / WORLD_WIDTH) * 12.3) * 8;
}

// filterNorm: 0 = top (high filter), 1 = bottom (low filter)
export function filterFromNorm(norm) {
  return Math.pow(10, (1 - norm) * 3.8 + 1.5);
}

export function toneHz(t) {
  return Math.pow(10, t * 3.5 + 1.3);
}

export function nodeRadius(node) {
  return NODE_MIN_R + (NODE_MAX_R - NODE_MIN_R) * node.volume;
}

export function effectivePan(node) {
  return node.panOverride ?? 0;
}

export function gravityFactor(a, b) {
  const canvasW = document.getElementById('main').width;
  const canvasH = document.getElementById('main').height;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(0, 1 - d / (Math.hypot(canvasW, canvasH) * .65)) * state.gravityStrength * 2;
}

export function nodeFreq(node) {
  let base = freqFromX(node.x) + (node.typeParams?.detune || 0), pull = 0;
  for (const other of state.nodes) {
    if (other === node || other.muted) continue;
    pull += (freqFromX(other.x) - base) * gravityFactor(node, other) * .3;
  }
  return Math.max(8, Math.min(40000, base + pull));
}

export function gravityPull(node) {
  let pull = 0;
  for (const other of state.nodes) {
    if (other !== node && !other.muted) pull += gravityFactor(node, other);
  }
  return pull;
}

// ── Tone.js global setup ──────────────────────────────────────
// Larger scheduling lookahead — reduces audio glitches under CPU load.
// 300ms is imperceptible latency for ambient sound but prevents dropout.
Tone.context.lookAhead = 0.3;
Tone.context.updateInterval = 0.05;

export const masterGain   = new Tone.Gain(state.masterVolume);
export const masterFilter = new Tone.Filter(toneHz(state.masterTone), 'lowpass');
export const locut        = new Tone.Filter(20, 'highpass');
export const hiCut        = new Tone.Filter(20000, 'lowpass');
export const masterReverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0 });
export const masterDelay  = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.35, wet: 0 });
export const limiter      = new Tone.Limiter(-3).toDestination();

// master chain: gain → locut → hiCut → tone filter → delay → reverb → limiter
masterGain.connect(locut);
locut.connect(hiCut);
hiCut.connect(masterFilter);
masterFilter.connect(masterDelay);
masterDelay.connect(masterReverb);
masterReverb.connect(limiter);

// recorder connected permanently at init — avoids modifying audio graph during playback
export const masterRecorder = new Tone.Recorder();
limiter.connect(masterRecorder);

// master analyser tapped before effects (raw mix of all nodes)
export const masterAnalyser = new Tone.Analyser('fft', 2048);
masterAnalyser.smoothing = 0.85;
masterGain.connect(masterAnalyser);

// ── Per-node audio lifecycle ──────────────────────────────────
export function createAudio(node) {
  const panner    = new Tone.Panner(effectivePan(node)).connect(masterGain);
  const nodeDelay = new Tone.FeedbackDelay({
    delayTime: (node.nodeDelayTime ?? 250) / 1000,
    feedback:  (node.nodeDelayFeedback ?? 0) / 100,
    wet:       (node.nodeDelayWet ?? 0) / 100,
  }).connect(panner);
  const envelope = new Tone.AmplitudeEnvelope({
    attack:  node.attack  ?? 0.3,
    decay:   node.decay   ?? 0.1,
    sustain: (node.sustain ?? 100) / 100,
    release: node.release ?? 0.8,
  }).connect(nodeDelay);
  const filter = new Tone.Filter(filterFromNorm(node.filterNorm ?? 0.5), 'lowpass').connect(envelope);
  const gain   = new Tone.Gain(node.volume * .28).connect(filter);
  let source, vibrato = null;

  if (node.type === 'noise') {
    source = new Tone.Noise(node.typeParams.color ?? 'pink');
    filter.set({ Q: node.typeParams.resonance ?? 1 });
    source.connect(gain);
  } else if (node.type === 'square' || node.type === 'sawtooth') {
    const voices = node.typeParams.voices ?? 1;
    source = voices > 1
      ? Object.assign(new Tone.FatOscillator(nodeFreq(node), node.type, node.typeParams.spread ?? 0), { count: voices })
      : new Tone.Oscillator(nodeFreq(node), node.type);
    source.detune.value = node.typeParams.detune ?? 0;
    source.connect(gain);
  } else {
    source = new Tone.Oscillator(nodeFreq(node), node.type);
    source.detune.value = node.typeParams.detune ?? 0;
    const rate  = node.typeParams.vibratoRate  ?? 0;
    const depth = node.typeParams.vibratoDepth ?? 0;
    if (rate > 0 && depth > 0) {
      vibrato = new Tone.Vibrato(rate, depth / 1200);
      source.connect(vibrato); vibrato.connect(gain);
    } else {
      source.connect(gain);
    }
  }

  // per-node reverb/delay sends
  const reverbSend = new Tone.Gain(node.reverbSend ?? 0);
  const delaySend  = new Tone.Gain(node.delaySend  ?? 0);
  panner.connect(reverbSend); reverbSend.connect(masterReverb);
  panner.connect(delaySend);  delaySend.connect(masterDelay);

  // per-node analyser for spectrum display
  const analyser = new Tone.Analyser('fft', 512);
  analyser.smoothing = 0.8;
  panner.connect(analyser);

  node.audio = { source, gain, envelope, filter, nodeDelay, panner, vibrato, reverbSend, delaySend, analyser, orbitLFOs: [] };

  if (state.isPlaying) {
    source.start?.();
    if (!node.muted) envelope.triggerAttack();
  }
  createOrbitLFOs(node);
}

export function destroyAudio(node) {
  if (!node.audio) return;
  const audio = node.audio;
  node.audio = null;
  const releaseMs = Math.min(((node.release ?? 0.8) + 0.1) * 1000, 3000);
  try { audio.envelope.triggerRelease(); } catch {}
  for (const lfo of audio.orbitLFOs ?? []) { try { lfo?.stop(); lfo?.disconnect(); } catch {} }
  setTimeout(() => {
    try { audio.source.stop?.(); } catch {}
    [audio.vibrato, audio.source, audio.gain, audio.filter, audio.envelope,
     audio.nodeDelay, audio.panner, audio.reverbSend, audio.delaySend, audio.analyser
    ].forEach(x => { try { x?.disconnect(); } catch {} });
  }, releaseMs + 100);
}

export function updateAudio(node) {
  if (!node.audio) return;
  if (node.type !== 'noise') {
    node.audio.source.frequency?.rampTo(nodeFreq(node), .06);
    node.audio.source.detune?.rampTo(node.typeParams.detune ?? 0, .06);
  }
  node.audio.filter.frequency.rampTo(filterFromNorm(node.filterNorm ?? 0.5), .06);
  if (node.type === 'noise') node.audio.filter.set({ Q: node.typeParams.resonance ?? 1 });
  node.audio.nodeDelay.delayTime.rampTo((node.nodeDelayTime ?? 250) / 1000, .1);
  node.audio.nodeDelay.feedback.rampTo((node.nodeDelayFeedback ?? 0) / 100, .1);
  node.audio.nodeDelay.wet.rampTo((node.nodeDelayWet ?? 0) / 100, .1);
  node.audio.panner.pan.rampTo(effectivePan(node), .06);
  node.audio.gain.gain.rampTo(node.volume * .28, .06);
  node.audio.envelope.set({
    attack:  node.attack  ?? 0.3,
    decay:   node.decay   ?? 0.1,
    sustain: (node.sustain ?? 100) / 100,
    release: node.release ?? 0.8,
  });
  if (state.isPlaying && !node.muted) node.audio.envelope.triggerAttack();
  else if (node.muted) node.audio.envelope.triggerRelease();
}

export function rebuildAudio(node) {
  destroyAudio(node);
  createAudio(node);
}

export function startAll() {
  for (const node of state.nodes) {
    if (node.audio) {
      node.audio.source.start?.();
      if (!node.muted) node.audio.envelope.triggerAttack();
      startOrbitLFOs(node);
    } else {
      createAudio(node);
    }
  }
}

export function stopAll() {
  for (const node of state.nodes) {
    if (node.audio) {
      node.audio.envelope.triggerRelease();
      stopOrbitLFOs(node);
    }
  }
}

// ── FX parameter converters ───────────────────────────────────
export function locutHz(v)  { return Math.pow(10, v / 100 * 2.6 + 1.3); }
export function hicutHz(v)  { return Math.pow(10, (1 - v / 100) * 1.0 + 3.301); }
export function decaySeconds(v)  { return 0.3 + (v / 100) * 9.7; }
export function delayMilliseconds(v) { return 50 + (v / 100) * 950; }
