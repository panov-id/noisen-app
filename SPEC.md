# Noisen — Product Specification v3.0

Minimal PWA for meditative sound generation. No accounts. No distractions. Just sound.

---

## 1. Product overview

**Type:** Progressive Web Application (installable, offline-capable)  
**Target:** Anyone who wants ambient sound / focus music / sleep aid with no setup  
**Positioning:** Between a simple white noise app and a full DAW — visual, tactile, generative

### Core principle
Place nodes on an infinite canvas. Each node synthesizes sound based on its position. Nodes interact through gravity. Two modes: continuous ambient synthesis or BPM-locked drum sequencer.

---

## 2. Modes

### 2.1 Ambient mode (default)

Continuous synthesis — nodes play as long as the app runs.

**Node position → audio mapping:**

| Axis | Parameter | Range |
|---|---|---|
| X (world) | Frequency | 8 Hz → ~40 kHz (logarithmic, independent of screen size) |
| Y (world) | Filter cutoff | Top = bright/open, bottom = dark/filtered |
| X position (normalized) | Stereo pan | Left edge = −1, right edge = +1 |
| Node size | Volume | Larger = louder |

**Ambient node types:**

| Type | Synthesis | Character |
|---|---|---|
| Sine | OscillatorNode | Pure tone, single frequency |
| Triangle | OscillatorNode | Soft, hollow, weak overtones |
| Square | OscillatorNode (+ detune/spread) | Buzzy, odd harmonics |
| Sawtooth | OscillatorNode (+ detune/spread) | Bright, full harmonic series |
| Noise | Tone.NoiseSynth | Pink / white / brown texture bed |

**Per-node parameters (ambient):**

| Parameter | Control | Range |
|---|---|---|
| Volume | Slider | 0–1 |
| Pan | Slider | −1 to +1 |
| Attack | Slider | 10ms–10s |
| Decay | Slider | 10ms–10s |
| Sustain | Slider | 0–100% |
| Release | Slider | 10ms–10s |
| Filter cutoff | Slider | 20Hz–20kHz |
| Detune | Slider | −24 to +24 semitones (Sine, Triangle) |
| Vibrato rate | Slider | 0–10 Hz (Sine, Triangle) |
| Vibrato depth | Slider | 0–100 cents (Sine, Triangle) |
| Voices | Slider | 1–5 (Square, Sawtooth) |
| Spread | Slider | 0–2 semitones (Square, Sawtooth) |
| Noise color | Selector | Pink / White / Brown |
| Resonance | Slider | 0–5 (Noise) |
| Node delay time | Slider | 10–1000ms |
| Node delay feedback | Slider | 0–0.95 |
| Node delay wet | Slider | 0–1 |
| Reverb send | Slider | 0–1 |
| Delay send | Slider | 0–1 |

### 2.2 Beat mode (♩ button)

BPM-locked drum sequencer. Activating beat mode:
- Shows BPM control in topbar (range 40–300, step 1)
- Adds drum node types to the type selector
- Starts Tone.Transport when playback begins

**Drum node types:**

| Type | Synthesis | Key params |
|---|---|---|
| Kick | Tone.MembraneSynth | tune (pitch), decay, pitchDecay (pitch fall) |
| Snare | Tone.NoiseSynth | decay, tone (noise color) |
| Hihat | Tone.MetalSynth | tune (frequency), decay, open (0=closed, 1=open) |
| Clap | Tone.NoiseSynth | decay, tone (noise color) |
| Perc | Tone.MetalSynth | tune (frequency), decay |

**Per-node parameters (drum):**

| Parameter | Control | Range |
|---|---|---|
| Volume | Slider | 0–1 |
| Pan | Slider | −1 to +1 |
| Tune | Slider | type-specific Hz range |
| Decay | Slider | 20ms–1.5s |
| Pitch decay | Slider | 0.01–0.5 (Kick only) |
| Tone | Slider | 0–1 (Snare, Clap) |
| Open | Toggle | 0 = closed, 1 = open (Hihat) |
| Reverb send | Slider | 0–1 |
| Delay send | Slider | 0–1 |

**16-step sequencer:**
- Each drum node has an independent 16-step grid
- Portrait: 1×16 full width. Landscape: 8+8 two rows
- Active steps trigger the synth at the scheduled beat time
- Currently playing step highlighted in real time
- 2ms type-offset for same-type nodes on same step (avoids shared synth collision)

---

## 3. Orbit modulation (LFOs)

Each node supports up to **3 independent orbits** — sine LFOs that modulate a parameter continuously.

| Target | Ambient | Drum |
|---|---|---|
| Filter cutoff | ✓ | — |
| Pan | ✓ | ✓ |
| Volume | ✓ | ✓ |
| Delay wet | ✓ | — |

**Controls:** Rate (0.02–2 Hz) · Depth (0–100%) · Direction (↻ / ↺)  
**Visual:** Dashed ring around node with moving dot following direction  
**Implementation:** Interval-based (50ms tick), rampTo(value, 0.05) for smooth transitions

---

## 4. Gravity

Nodes attract each other with Gaussian falloff:

```
factor = max(0, 1 - distance / (diagonal × 0.65)) × gravityStrength × 2
```

- Strength set globally (0–1 slider)
- Runs every 3rd frame to reduce audio thread pressure
- Affects both X (frequency drift) and Y (filter drift) of ambient nodes
- Dragging suspends gravity for that node; resumes on release

---

## 5. Master FX chain

Signal path: `node → nodeDelay → masterGain → masterFilter → reverb → delay → Tone.Destination`

| Control | Type | Range |
|---|---|---|
| Volume | Gain | 0–1 |
| Tone | Lowpass filter | log scale |
| Lo Cut | Highpass filter | 20–500 Hz |
| Hi Cut | Lowpass filter | 1–20 kHz |
| Reverb wet | Convolver wet | 0–1 |
| Reverb decay | Reverb time | 0.1–10s |
| Delay wet | FeedbackDelay wet | 0–1 |
| Delay time | FeedbackDelay time | 0.05–1s |
| Delay feedback | FeedbackDelay feedback | 0–0.95 |

---

## 6. Random presets

### Ambient archetypes (14)

Anti-repeat: never generates the same archetype twice in a row.

| Archetype | Description |
|---|---|
| Binaural beats | Carriers + beat frequency, delta/theta/alpha/beta bands |
| Solfeggio | Sacred frequencies 174–963 Hz |
| Harmonic series | Natural overtone stack |
| Full spectrum | Sub · bass · mid · presence · air |
| Scale | Major / Minor / Pentatonic / Dorian / Lydian / Phrygian |
| Polyrhythm | Integer-ratio LFO rates (1:1.5:2:3…) |
| Gamelan bells | Inharmonic high intervals |
| Pentatonic pulse | 5 pentatonic voices at independent rates |
| Fibonacci / φ | Frequencies and LFO rates from golden ratio |
| Drone swarm | Micro-detuned unisons 30–600 Hz |
| Deep sub | Sub-bass territory 14–55 Hz |
| Crystalline | High shimmer 1.2–18 kHz |
| Noise texture | Layered noise bands |
| Stochastic | Fully random across 10 octaves |

### Beat archetypes (5)

| Archetype | Description |
|---|---|
| Drum kit | Four-on-floor / breakbeat / half-time / euclidean patterns |
| Drum + bass | Drum kit + sub-bass ambient sine layer |
| Drum + pad | Drum kit + 2–4 harmonic pad nodes with reverb |
| Drum + drone | Drum kit + 2–3 drone layers with pan orbits |
| Drum + texture | Drum kit + noise texture with filter orbit |

---

## 7. Presets & sharing

- Save up to N named presets in localStorage
- Share via URL: `https://noisen.space/?p=<base64-compressed-state>`
- Preset encodes: all nodes (position, type, params, steps, orbits), mode, BPM
- No server — full state in URL

---

## 8. Interface layout

### Topbar (68px fixed)
Left: App name / logo · Version badge  
Right: Donate · GitHub · Install PWA · Theme toggle · Random preset · Presets · Nodes list · Master FX · Fullscreen · Help

On mobile (≤480px): secondary buttons move to dropdown (hamburger ☰)

### Canvas area
Full viewport minus topbar (68px) and node panel (variable, ~240px)  
Background: dot grid following zoom/pan  
Rendering: Canvas 2D, requestAnimationFrame

### Node panel (bottom sheet)
Appears when a node is selected. Tabbed:
- **Sound** — type selector + type-specific params as cards
- **Envelope** (ambient) / **Steps** (drum) — ADSR or sequencer grid
- **FX** — reverb send, delay send
- **Orbits** — up to 3 LFO orbits

### Overlays
- Presets sheet
- Nodes list sheet
- Master FX sheet
- Frequency spectrum (FFT, per-node colors + master white)
- Help / wizard
- Changelog (WHATSNEW)

---

## 9. Audio architecture

```
AudioContext (Tone.js)
  ├─ Per-node chain (ambient):
  │    OscillatorNode → Gain (volume) → Panner → Filter → NodeDelay
  │    → ReverbSend → DelayBusSend → masterGain
  │
  ├─ Per-type drum panners:
  │    MembraneSynth (kick) → drumPanners.kick → masterGain
  │    NoiseSynth (snare)   → drumPanners.snare → masterGain
  │    MetalSynth (hihat)   → drumPanners.hihat → masterGain
  │    NoiseSynth (clap)    → drumPanners.clap  → masterGain
  │    MetalSynth (perc)    → drumPanners.perc  → masterGain
  │
  └─ Master chain:
       masterGain → masterFilter → masterReverb → masterDelay → Tone.Destination
```

Tone.context settings:
- `lookAhead = 0.3` (300ms scheduling window, prevents glitches under CPU load)
- `updateInterval = 0.05` (50ms param update rate)

---

## 10. PWA

- Service worker: caches all assets on install, serves from cache on subsequent visits
- Cache key includes build hash → cache busts on every deploy
- Manifest: name, short_name, icons (192/512, maskable), display=standalone, orientation=any
- MediaSession API: lock screen controls (play/pause/stop)
- Silent mode workaround: uses Web Audio API directly (not `<audio>` element)

---

## 11. Build & deploy

| Step | Tool | Output |
|---|---|---|
| Build | Docker + Node 20 + Vite 5 | `dist/` |
| Deploy | BunnyCDN Storage API | CDN edge |
| Cache purge | BunnyCDN Pull Zone API | Instant propagation |

Environments:
- **Production:** `noisen.space` — deploy on git tag
- **UAT:** `uat.noisen.space` — deploy on push to `main`

---

## 12. Browser support

Requires Web Audio API. Tested on:
- Chrome / Edge (desktop + Android)
- Safari (iOS 15+, macOS)
- Firefox (desktop)

No IE. No fallback for browsers without AudioContext.
