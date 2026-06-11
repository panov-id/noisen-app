// ── Audio engine (Tone.js) ────────────────────────────────────
// Tone.js is loaded via CDN script tag — available as global `Tone`

import { state, TYPES, TYPE_DEFAULTS, DRUM_TYPES, WORLD_WIDTH, NODE_MIN_R, NODE_MAX_R } from './store.js';

// ── Orbit LFO helpers ─────────────────────────────────────────
// Each orbit modulates one audio parameter via a sine LFO.
// LFO output range is computed relative to the current param value.

// Interval-based LFO — avoids Tone.js AudioParam range validation issues.
// Updates every 50ms (20Hz), sufficient for LFO rates up to 2Hz.
// Uses rampTo() so transitions are smooth even at low update rate.
const LFO_INTERVAL_MS = 50;

function createOrbitLFO(orbit, node) {
  try {
    const audio = node.audio;
    if (!audio) { console.warn('[orbit] no audio on node', node.id); return null; }
    const { target, rate, depth } = orbit;
    const d = depth / 100;
    let phase = 0;
    let intervalId = null;

    console.log(`[orbit] create target=${target} rate=${rate} depth=${depth} node=${node.id}`);

    function computeTargetRange() {
      if (target === 'filter') {
        const base = filterFromNorm(node.filterNorm ?? 0.5);
        return { min: base * Math.pow(2, -d * 2), max: base * Math.pow(2, d * 2) };
      } else if (target === 'pan') {
        const base = effectivePan(node);
        return { min: Math.max(-1, base - d), max: Math.min(1, base + d) };
      } else if (target === 'volume') {
        const base = node.volume * 0.28;
        return { min: base * (1 - d * 0.9), max: base };
      } else if (target === 'delay') {
        return { min: 0, max: d };
      } else if (target === 'reverb') {
        return { min: 0, max: d };
      } else if (target === 'delay-time') {
        const base = (node.nodeDelayTime ?? 250) / 1000;
        return { min: Math.max(0.01, base - d * 0.5), max: Math.min(2, base + d * 0.5) };
      } else if (target === 'attack') {
        const base = node.attack ?? 0.3;
        return { min: Math.max(0.01, base * (1 - d)), max: Math.min(10, base * (1 + d)) };
      } else if (target === 'release') {
        const base = node.release ?? 0.8;
        return { min: Math.max(0.05, base * (1 - d)), max: Math.min(10, base * (1 + d)) };
      }
      return null;
    }

    function applyValue(value) {
      try {
        if      (target === 'filter')     audio.filter.frequency.rampTo(value, 0.05);
        else if (target === 'pan')        audio.panner.pan.rampTo(value, 0.05);
        else if (target === 'volume')     audio.gain.gain.rampTo(value, 0.05);
        else if (target === 'delay')      audio.nodeDelay.wet.rampTo(value, 0.05);
        else if (target === 'reverb')     audio.reverbSend?.gain.rampTo(value, 0.05);
        else if (target === 'delay-time') audio.nodeDelay.delayTime.rampTo(value, 0.1);
        else if (target === 'attack')     audio.envelope.set({ attack: value });
        else if (target === 'release')    audio.envelope.set({ release: value });
      } catch (error) {
        console.error('[orbit] applyValue failed:', error);
      }
    }

    function tick() {
      if (!node.audio) { stop(); return; }
      const range = computeTargetRange();
      if (!range) return;
      const sine = Math.sin(phase * Math.PI * 2);
      const value = (range.min + range.max) / 2 + sine * (range.max - range.min) / 2;
      applyValue(value);
      const direction = orbit.direction === -1 ? -1 : 1;
      phase += direction * orbit.rate * (LFO_INTERVAL_MS / 1000);
      if (phase >= 1) phase -= 1;
      if (phase < 0)  phase += 1;
    }

    function start() {
      if (intervalId != null) return;
      const range = computeTargetRange();
      if (!range) { console.warn('[orbit] unknown target', target); return; }
      console.log(`[orbit] starting interval LFO target=${target} range=[${range.min.toFixed(3)}, ${range.max.toFixed(3)}]`);
      intervalId = setInterval(tick, LFO_INTERVAL_MS);
    }

    function stop() {
      if (intervalId != null) { clearInterval(intervalId); intervalId = null; }
    }

    function disconnect() {
      stop();
      // restore param to static node value so audio continues normally
      try {
        if      (target === 'filter')     audio.filter.frequency.rampTo(filterFromNorm(node.filterNorm ?? 0.5), 0.1);
        else if (target === 'pan')        audio.panner.pan.rampTo(effectivePan(node), 0.1);
        else if (target === 'volume')     audio.gain.gain.rampTo(node.volume * 0.28, 0.1);
        else if (target === 'delay')      audio.nodeDelay.wet.rampTo((node.nodeDelayWet ?? 0) / 100, 0.1);
        else if (target === 'reverb')     audio.reverbSend?.gain.rampTo(node.reverbSend ?? 0, 0.1);
        else if (target === 'delay-time') audio.nodeDelay.delayTime.rampTo((node.nodeDelayTime ?? 250) / 1000, 0.1);
        else if (target === 'attack')     audio.envelope.set({ attack: node.attack ?? 0.3 });
        else if (target === 'release')    audio.envelope.set({ release: node.release ?? 0.8 });
      } catch {}
    }

    if (state.isPlaying && orbit.enabled) start();
    console.log(`[orbit] created OK target=${target}`);
    return { start, stop, disconnect, _intervalId: () => intervalId };
  } catch (error) {
    console.error('[orbit] createOrbitLFO failed:', error);
    return null;
  }
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
  if (!node.audio) { console.warn('[orbit] syncOrbitLFO: no audio', node.id); return; }
  if (!node.audio.orbitLFOs) node.audio.orbitLFOs = [];
  const old = node.audio.orbitLFOs[index];
  try { old?.stop(); old?.disconnect(); } catch (error) { console.warn('[orbit] destroy old LFO:', error); }
  const orbit = node.orbits?.[index];
  console.log(`[orbit] syncOrbitLFO node=${node.id} index=${index} orbit=`, orbit);
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
// 'balanced' latencyHint gives ~50ms hardware buffer — better glitch resistance
// than the default 'interactive' without noticeable latency for ambient/beat use.
Tone.setContext(new Tone.Context({ latencyHint: 'balanced' }));
// Scheduling lookahead: 300ms prevents dropout under CPU load.
Tone.context.lookAhead = 0.3;
Tone.context.updateInterval = 0.05;

export const masterGain   = new Tone.Gain(state.masterVolume);
export const masterFilter = new Tone.Filter(toneHz(state.masterTone), 'lowpass');
export const locut        = new Tone.Filter(20, 'highpass');
export const hiCut        = new Tone.Filter(20000, 'lowpass');
export const masterReverb      = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0 });
export const masterDelay       = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.35, wet: 0 });
// Compressor catches drum transients before the hard limiter.
// Fast attack (3ms) prevents click-through on loud hits.
export const masterCompressor  = new Tone.Compressor({ threshold: -10, ratio: 4, attack: 0.003, release: 0.15, knee: 6 });
export const limiter           = new Tone.Limiter(-2).toDestination();

// master chain: gain → locut → hiCut → tone filter → compressor → delay → reverb → limiter
masterGain.connect(locut);
locut.connect(hiCut);
hiCut.connect(masterFilter);
masterFilter.connect(masterCompressor);
masterCompressor.connect(masterDelay);
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
    ].forEach(x => {
      try { x?.disconnect(); } catch {}
      try { x?.dispose?.(); } catch {}
    });
  }, releaseMs + 100);
}

// Suspend and resume the AudioContext to flush stale scheduled events and
// encourage GC of disconnected native nodes. Call when audio feels sluggish.
export function cleanupAudioGraph() {
  const ctx = Tone.context.rawContext;
  ctx.suspend().then(() => ctx.resume()).catch(() => {});
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
    if (DRUM_TYPES.has(node.type)) continue;
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
    if (DRUM_TYPES.has(node.type)) continue;
    if (node.audio) {
      node.audio.envelope.triggerRelease();
      stopOrbitLFOs(node);
    }
  }
}

// ── Beat mode: shared drum synths ────────────────────────────
let drumSynths       = null;
let drumPanners      = null;
let drumReverbSends  = null;
let drumDelaySends   = null;
let beatScheduleId   = null;

function initDrumSynths() {
  if (drumSynths) return;

  const DRUM_TYPES_LIST = ['kick', 'snare', 'hihat', 'clap', 'perc'];

  // each drum type gets its own panner → main mix + per-type reverb/delay sends
  drumPanners     = {};
  drumReverbSends = {};
  drumDelaySends  = {};
  for (const type of DRUM_TYPES_LIST) {
    drumReverbSends[type] = new Tone.Gain(0).connect(masterReverb);
    drumDelaySends[type]  = new Tone.Gain(0).connect(masterDelay);
    drumPanners[type]     = new Tone.Panner(0).connect(masterGain);
    drumPanners[type].connect(drumReverbSends[type]);
    drumPanners[type].connect(drumDelaySends[type]);
  }

  const kickSynth = new Tone.MembraneSynth({
    pitchDecay: 0.07, octaves: 7,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
  }).connect(drumPanners.kick);

  const snareSynth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
  }).connect(drumPanners.snare);

  const hihatSynth = new Tone.MetalSynth({
    frequency: 400, envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
    harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
  }).connect(drumPanners.hihat);

  const clapSynth = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
  }).connect(drumPanners.clap);

  const percSynth = new Tone.MetalSynth({
    frequency: 200, envelope: { attack: 0.001, decay: 0.25, release: 0.01 },
    harmonicity: 5.1, modulationIndex: 16, resonance: 2000, octaves: 1.5,
  }).connect(drumPanners.perc);

  drumSynths = { kick: kickSynth, snare: snareSynth, hihat: hihatSynth, clap: clapSynth, perc: percSynth };
}

// Orbit LFO for drum nodes — only volume and pan targets make sense.
// Stores intervals on node.drumOrbitLFOs array (parallel to node.orbits).
function createDrumOrbitLFO(orbit, node) {
  const { target, rate, depth } = orbit;
  const d = depth / 100;
  let phase = 0;

  const intervalId = setInterval(() => {
    const direction = orbit.direction === -1 ? -1 : 1;
    phase += direction * rate * (LFO_INTERVAL_MS / 1000);
    if (phase >= 1) phase -= 1;
    if (phase < 0)  phase += 1;
    const sine = Math.sin(phase * Math.PI * 2);

    if (target === 'volume') {
      const base = orbit._baseVolume ?? node.volume;
      orbit._baseVolume = base;
      node.volume = Math.max(0.02, Math.min(1, base + sine * d * 0.5));
    } else if (target === 'pan') {
      const base = orbit._basePan ?? (node.panOverride ?? 0);
      orbit._basePan = base;
      const newPan = Math.max(-1, Math.min(1, base + sine * d));
      node.panOverride = newPan;
      if (drumPanners?.[node.type]) drumPanners[node.type].pan.rampTo(newPan, 0.05);
    } else if (target === 'filter') {
      // for drums: modulate tune/pitch of the next triggered hit
      const defaultTune = node.type === 'kick' ? 60 : node.type === 'hihat' ? 400 : node.type === 'perc' ? 200 : 200;
      const base = orbit._baseTune ?? (node.typeParams?.tune ?? defaultTune);
      orbit._baseTune = base;
      node.typeParams = node.typeParams ?? {};
      node.typeParams.tune = Math.max(20, base + sine * d * 0.5 * base);
    } else if (target === 'delay') {
      // for drums: modulate decay time of the next triggered hit
      const defaultDecay = node.type === 'kick' ? 0.35 : node.type === 'hihat' ? 0.06 : 0.18;
      const base = orbit._baseDecay ?? (node.typeParams?.decay ?? defaultDecay);
      orbit._baseDecay = base;
      node.typeParams = node.typeParams ?? {};
      node.typeParams.decay = Math.max(0.01, Math.min(2, base + sine * d * base));
    } else if (target === 'reverb') {
      if (drumReverbSends?.[node.type]) {
        const base = orbit._baseReverb ?? (node.reverbSend ?? 0);
        orbit._baseReverb = base;
        const val = Math.max(0, Math.min(1, base + sine * d * 0.5));
        drumReverbSends[node.type].gain.rampTo(val, 0.05);
      }
    } else if (target === 'delay-time') {
      if (drumDelaySends?.[node.type]) {
        const base = orbit._baseDelayLevel ?? (node.delaySend ?? 0);
        orbit._baseDelayLevel = base;
        const val = Math.max(0, Math.min(1, base + sine * d * 0.5));
        drumDelaySends[node.type].gain.rampTo(val, 0.05);
      }
    } else if (target === 'attack' || target === 'release') {
      // not applicable to drums — no-op
    }
  }, LFO_INTERVAL_MS);

  return { stop: () => clearInterval(intervalId) };
}

export function syncDrumOrbitLFO(node, index) {
  if (!node.drumOrbitLFOs) node.drumOrbitLFOs = [];
  node.drumOrbitLFOs[index]?.stop();
  const orbit = node.orbits?.[index];
  if (orbit) orbit._baseVolume = orbit._basePan = undefined;
  node.drumOrbitLFOs[index] = orbit?.enabled ? createDrumOrbitLFO(orbit, node) : null;
}

export function destroyDrumOrbitLFOs(node) {
  for (const lfo of node.drumOrbitLFOs ?? []) lfo?.stop();
  node.drumOrbitLFOs = [];
}

export function triggerDrumNode(node, time) {
  if (node.muted) return;
  initDrumSynths();
  const synth  = drumSynths[node.type];
  if (!synth) return;
  const params = node.typeParams ?? {};
  const volume = node.volume * 0.28;

  // apply per-node pan, reverb send, delay send for this hit
  if (drumPanners?.[node.type]) {
    drumPanners[node.type].pan.rampTo(effectivePan(node), 0.005);
  }
  if (drumReverbSends?.[node.type]) drumReverbSends[node.type].gain.rampTo(node.reverbSend ?? 0, 0.01);
  if (drumDelaySends?.[node.type])  drumDelaySends[node.type].gain.rampTo(node.delaySend  ?? 0, 0.01);

  if (node.type === 'kick') {
    const freq       = params.tune       ?? 60;
    const decay      = params.decay      ?? 0.35;
    const pitchDecay = params.pitchDecay ?? 0.07;
    synth.set({ pitchDecay, octaves: 7, envelope: { decay } });
    synth.volume.setValueAtTime(Tone.gainToDb(volume * 2.5), time);
    synth.triggerAttackRelease(freq, '8n', time);
  } else if (node.type === 'snare') {
    const decay = params.decay ?? 0.18;
    const tone  = params.tone  ?? 0.5;
    const noiseType = tone < 0.33 ? 'brown' : tone < 0.67 ? 'pink' : 'white';
    synth.set({ noise: { type: noiseType }, envelope: { decay } });
    synth.volume.setValueAtTime(Tone.gainToDb(volume * 2), time);
    synth.triggerAttackRelease('8n', time);
  } else if (node.type === 'hihat') {
    const open  = params.open  ?? 0;
    const decay = open > 0.5 ? 0.28 : (params.decay ?? 0.06);
    synth.set({ frequency: params.tune ?? 400, envelope: { decay } });
    synth.volume.setValueAtTime(Tone.gainToDb(volume * 1.5), time);
    synth.triggerAttackRelease('16n', time);
  } else if (node.type === 'clap') {
    const decay = params.decay ?? 0.12;
    const tone  = params.tone  ?? 0.5;
    const noiseType = tone < 0.33 ? 'brown' : tone < 0.67 ? 'pink' : 'white';
    synth.set({ noise: { type: noiseType }, envelope: { decay } });
    synth.volume.setValueAtTime(Tone.gainToDb(volume * 2), time);
    synth.triggerAttackRelease('8n', time);
  } else if (node.type === 'perc') {
    const freq  = params.tune  ?? 200;
    const decay = params.decay ?? 0.25;
    synth.set({ frequency: freq, envelope: { decay } });
    synth.volume.setValueAtTime(Tone.gainToDb(volume * 2), time);
    synth.triggerAttackRelease('16n', time);
  }

  // visual flash — spawn ripple via postMessage (avoid direct canvas import)
  node._beatFlash = true;
}

export function startBeat(bpm) {
  initDrumSynths();
  Tone.Transport.bpm.value = bpm;
  state.beatStep = -1;
  beatScheduleId = Tone.Transport.scheduleRepeat(time => {
    state.beatStep = (state.beatStep + 1) % 16;
    // offset same-type nodes by 2ms each to avoid shared synth collision clicks
    const typeOffset = {};
    for (const node of state.nodes) {
      if (!DRUM_TYPES.has(node.type) || node.muted) continue;
      if (!node.steps?.[state.beatStep]) continue;
      const offset = typeOffset[node.type] ?? 0;
      typeOffset[node.type] = offset + 0.002;
      triggerDrumNode(node, time + offset);
    }
  }, '16n');
  Tone.Transport.start();
}

export function stopBeat() {
  if (beatScheduleId !== null) {
    Tone.Transport.clear(beatScheduleId);
    beatScheduleId = null;
  }
  Tone.Transport.stop();
  state.beatStep = -1;
}

// ── FX parameter converters ───────────────────────────────────
export function locutHz(v)  { return Math.pow(10, v / 100 * 2.6 + 1.3); }
export function hicutHz(v)  { return Math.pow(10, (1 - v / 100) * 1.0 + 3.301); }
export function decaySeconds(v)  { return 0.3 + (v / 100) * 9.7; }
export function delayMilliseconds(v) { return 50 + (v / 100) * 950; }
