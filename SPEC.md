# Noisen — Implementation Specification

**Version:** 4.0  
**Stack:** Tone.js · Vite · ES modules · BunnyCDN · Supabase

---

## 1. Architecture

```
store.js      — shared reactive state + constants
audio.js      — Tone.js graph, per-node synthesis, beat sequencer
canvas.js     — coordinate math, hit testing, all drawing
ui.js         — param cards, node panel, FX panel, presets, what's new
main.js       — animation loop, physics, comet system, event handlers
links.js      — short links, QR codes, share modal
analytics.js  — Plausible + Supabase event tracking
debug.js      — memory/audio stats panel
```

---

## 2. Constants

| Constant | Value | Notes |
|---|---|---|
| `APP_VERSION` | `'4.0'` | |
| `WORLD_WIDTH` | `1920` | X-axis logical width |
| `WORLD_HEIGHT` | `1080` | Y-axis for screen-independent filterNorm |
| `TOP_H` | `68` | Topbar height in canvas pixels |
| `NODE_MIN_R` | `13` | Node radius at volume = 0 |
| `NODE_MAX_R` | `40` | Node radius at volume = 1 |
| `ZOOM_MIN` | `0.25` | |
| `ZOOM_MAX` | `4` | |
| `CLICK_FADE` | `0.02` | Seconds — master gain ramp on play/stop |
| `FRAME_TARGET_MS` | `33` | ~30 FPS |
| `LFO_INTERVAL_MS` | `50` | Orbit LFO update rate (20 Hz) |
| `COMET_MAX` | `5` | Maximum simultaneous comets |
| `COMET_TRAIL` | `32` | Trail segments per comet |

---

## 3. State

```js
state = {
  nodes: [],
  comets: [],
  ripples: [],
  selectedNode: null,

  isPlaying: false,
  isDark: true,
  largeText: true,

  viewX: 0, viewY: 0,    // world-space camera offset
  zoom: 1,               // ZOOM_MIN–ZOOM_MAX
  velX: 0, velY: 0,      // momentum pan velocity

  masterVolume: 0.7,
  gravityStrength: 0.5,
  masterTone: 0.6,
  waveSpread: 0.4,

  nodeSeq: 0,
  beatMode: false,
  bpm: 120,
  beatStep: -1,          // 0–15, -1 when stopped

  draggingNodeId: null,
  panelHeight: 240,      // canvas pixels, updated on resize

  cometOrbitScale: 1,
  cometSpeedScale: 1,
  cometGravityScale: 1,
}
```

---

## 4. Node Types

### Wave types (ambient mode)

| Type | Color | RGB |
|---|---|---|
| `sine` | `#3a7bd5` | `[58,123,213]` |
| `square` | `#c47c20` | `[196,124,32]` |
| `sawtooth` | `#9a2ab8` | `[154,42,184]` |
| `triangle` | `#1fa0aa` | `[31,160,170]` |
| `noise` | `#1d9e5a` | `[29,158,90]` |

### Drum types (beat mode)

| Type | Color | RGB | Defaults |
|---|---|---|---|
| `kick` | `#e05530` | `[224,85,48]` | `tune:60, decay:0.35, pitchDecay:0.07` |
| `snare` | `#d4a020` | `[212,160,32]` | `decay:0.18, tone:0.5` |
| `hihat` | `#30c8a0` | `[48,200,160]` | `tune:400, decay:0.06, open:0` |
| `clap` | `#b050d0` | `[176,80,208]` | `decay:0.12, tone:0.5` |
| `perc` | `#d06090` | `[208,96,144]` | `tune:200, decay:0.25` |

---

## 5. Audio Graph

### Master chain

```
per-node gain (volume × 0.28)
  → per-node filter (BiquadFilter lowpass)
  → per-node envelope (AmplitudeEnvelope ADSR)
  → per-node delay (FeedbackDelay)
  → per-node panner (Panner)
  → masterGain (state.masterVolume)
      ├→ masterAnalyser (FFT)
      ↓
  locut  (HighpassFilter, default 20 Hz)
      ↓
  hiCut  (LowpassFilter, default 20 kHz)
      ↓
  masterFilter  (LowpassFilter, toneHz(state.masterTone))
      ↓
  masterCompressor  (threshold -10 dB, ratio 4, attack 3 ms, release 150 ms)
      ↓
  masterDelay  (FeedbackDelay, default wet 0)
      ↓
  masterReverb  (Reverb, decay 2.5 s, preDelay 0.01 s, default wet 0)
      ↓
  limiter  (threshold -2 dB)
      ↓
  Destination + masterRecorder
```

### Tone.js context

```js
Tone.setContext(new Tone.Context({ latencyHint: 'balanced' }))
Tone.context.lookAhead     = 0.3   // 300 ms scheduling lookahead
Tone.context.updateInterval = 0.05  // 50 ms parameter polling
```

### Play / stop (click prevention)

```js
// play:
masterGain.gain.cancelScheduledValues(now)
masterGain.gain.setValueAtTime(0, now)
masterGain.gain.linearRampToValueAtTime(masterVolume, now + 0.02)

// stop:
masterGain.gain.linearRampToValueAtTime(0, now + 0.02)
setTimeout(triggerRelease, 25)
```

---

## 6. Frequency Formulas

### X → oscillator frequency

```
freq(x) = 2^( x/WORLD_WIDTH × 12.3 ) × 8
```
`x=0` → 8 Hz, `x=1920` → ≈40 kHz

### filterNorm → per-node filter cutoff

```
cutoff(norm) = 10^( (1 − norm) × 3.8 + 1.5 )
```
`norm=0` → 31 623 Hz · `norm=0.5` → 1 000 Hz · `norm=1` → 32 Hz

### master tone → master lowpass

```
toneHz(t) = 10^( t × 3.5 + 1.3 )
```

### Node radius

```
radius(node) = 13 + 27 × node.volume
```

---

## 7. Coordinate System

| Space | Description |
|---|---|
| World | Infinite 2D plane; nodes live here |
| Canvas | Fixed pixels set at startup, never resized |
| Viewport | CSS pixels; varies with orientation/resize |

### Conversions

```js
toCanvasCoords(vx, vy) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (vx - rect.left) * (canvas.width  / rect.width),
    y: (vy - rect.top)  * (canvas.height / rect.height),
  }
}

screenToWorld(vx, vy) {
  const { x: cx, y: cy } = toCanvasCoords(vx, vy)
  return { x: cx/zoom + viewX, y: cy/zoom + viewY }
}

worldToScreen(wx, wy) {
  return { x: (wx - viewX)*zoom, y: (wy - viewY)*zoom }
}

computeFilterNorm(vy) {
  const rect = canvas.getBoundingClientRect()
  const cy = (vy - rect.top) * (canvas.height / rect.height)
  return clamp( (cy - TOP_H) / (canvas.height - panelHeight - TOP_H), 0, 1 )
}
```

### filterNorm from world Y (physics loops)

```
filterNorm = clamp( (node.y - TOP_H) / WORLD_HEIGHT, 0.02, 0.98 )
```

### Zoom with pivot

```js
applyZoom(newZoom, pivotVx, pivotVy) {
  const { x:cx, y:cy } = toCanvasCoords(pivotVx, pivotVy)
  const wx = cx/zoom + viewX,  wy = cy/zoom + viewY
  zoom = clamp(newZoom, ZOOM_MIN, ZOOM_MAX)
  viewX = wx - cx/zoom;  viewY = wy - cy/zoom
}
```

### Canvas resize

Canvas pixel dimensions fixed at first `resize()` call; CSS stretches to fill viewport.

```js
scaleY = canvas.height / getBoundingClientRect().height
panelHeight = panel.offsetHeight × scaleY
// filterNorm refreshed for all nodes: (node.y - TOP_H) / WORLD_HEIGHT
```

---

## 8. Gravity Physics

### Factor

```
clusterR_links = √(W² + H²) × 0.65
factor(a,b)    = max(0, 1 - dist(a,b)/clusterR_links) × gravityStrength × 2
```

### Frequency pull

```
freq(node) = freqFromX(node.x) + Σ (freqFromX(other.x) - base) × factor × 0.3
```

### Clustering loop (every 3rd frame)

```
clusterR = √(W² + H²) × (0.08 + gravityStrength × 0.18)

for each node:
  for each other:
    dist = |node - other|
    skip if dist < 3 or dist > clusterR
    t     = dist / clusterR
    force = gravityStrength × 0.018 × e^(-t² × 4)   // Gaussian
    accumulate fx, fy

  node.x += fx;  node.y += fy
  node.filterNorm = clamp((node.y - TOP_H) / WORLD_HEIGHT, 0.02, 0.98)
```

---

## 9. Comet System

### Structure

```js
{
  id, cx, cy,               // orbit center (world)
  rx, ry,                   // semi-axes
  tilt,                     // ellipse rotation (radians)
  angle,                    // current parametric angle
  speed,                    // rad/frame (+ = CCW, - = CW)
  mass,                     // field strength multiplier
  influence,                // field radius (px)
  color, size,
  trail: [],                // [{x,y}], max 32
  life, maxLife,
  permanent,                // never fades if true
  fadeSpeed,                // life -= fadeSpeed each frame (default 1)
  alpha,                    // computed each frame
  _baseRx, _baseMass, _baseInfluence,
}
```

### Orbital position

```
ex = rx × cos(angle)
ey = ry × sin(angle)
pos.x = cx + ex×cos(tilt) - ey×sin(tilt)
pos.y = cy + ex×sin(tilt) + ey×cos(tilt)
```

### Alpha

```
lifeRatio = life / maxLife
fadeIn    = 1 - max(0, (lifeRatio - 0.85) / 0.15)
fadeOut   = min(1, lifeRatio / 0.12)
alpha     = fadeIn × fadeOut       // or 1.0 if permanent
```

### Node gravity field

```
t     = 1 - dist / influence
force = mass × t² × 15 × alpha    // quadratic falloff

node._cDx += (Δx/dist) × force
node._cDy += (Δy/dist) × force
cap |(_cDx, _cDy)| at 100
```

### Displacement decay per frame

```
touched nodes  → × 0.88
untouched      → × 0.84, zero out if magnitude < 0.5
```

### Hidden-tab loop

```
visibilitychange → hidden : setInterval(() => updateComets(now()), 33)
visibilitychange → visible: clearInterval
```

---

## 10. Orbit LFO

Each node supports up to 3 LFOs, updated every 50 ms.

### Parameters

```js
{ target, rate: 0.02–2 Hz, depth: 0–100%, direction: 1|-1, enabled }
```

Targets: `filter | pan | volume | delay | reverb | delay-time | attack | release`

### Computation

```
phase  += direction × rate × 0.05     // 50 ms step
sine    = sin(phase × 2π)
value   = (min+max)/2 + sine × (max-min)/2
```

### Ranges (`d = depth/100`)

| Target | min | max |
|---|---|---|
| `filter` | `base × 2^(-d×2)` | `base × 2^(d×2)` |
| `pan` | `max(-1, base-d)` | `min(1, base+d)` |
| `volume` | `base × (1-d×0.9)` | `base` |
| `delay` / `reverb` | `0` | `d` |
| `delay-time` | `max(0.01, base-d×0.5)` | `min(2, base+d×0.5)` |
| `attack` / `release` | `max(0.01, base×(1-d))` | `min(10, base×(1+d))` |

---

## 11. Beat Sequencer

- 16-step boolean pattern per drum node
- `Tone.Transport.scheduleRepeat(fn, '16n')`
- BPM on drum preset: random from `[75,85,90,95,100,110,120,125,130,140]`
- Same-type instances: 2 ms stagger to prevent phase cancellation
- Groove styles: four-on-floor, breakbeat, half-time, euclidean, sparse, dense

Euclidean:

```js
function euclidean(steps, hits) {
  let bucket = 0
  return Array.from({ length: steps }, () => {
    bucket += hits
    if (bucket >= steps) { bucket -= steps; return true }
    return false
  })
}
```

---

## 12. FX Formulas

| Control | Formula | Input range | Output range |
|---|---|---|---|
| Lo Cut | `10^(v/100 × 2.6 + 1.3)` | 0–100 | 20 Hz – 4 kHz |
| Hi Cut | `10^((1-v/100) × 1.0 + 3.301)` | 0–100 | 20 kHz – 2 kHz |
| Reverb Decay | `0.3 + (v/100) × 9.7` | 0–100 | 0.3 s – 10 s |
| Delay Time | `50 + (v/100) × 950` | 0–100 | 50 ms – 1 000 ms |
| Reverb Wet | `v / 100` | 0–100 | 0–1 |
| Delay Wet | `v / 100` | 0–100 | 0–1 |
| Feedback | `v / 100` | 0–90 | 0–0.9 |

---

## 13. Rendering

### Draw order

```
clearRect
drawGrid
ctx.save() → scale(zoom) → translate(-viewX, -viewY)
  drawNodeWaves     ring gradients (non-drum)
  drawLinks         gravity connection lines
  drawRipples       tap ripples
  drawComets        trail segments + head glow
  drawOrbits        dashed rings + moving dot
  drawNodes         disc + volume arc + pan indicator + label
ctx.restore()
drawViewIndicator   freq/position label top-right
// spectrum canvas: every 100 ms
```

### Wave rings

```
angSpeed  = 0.0004 + log₂(max(1, freq/20)) × 0.00080
maxRadius = √(W²+H²) × (0.06 + filterNorm×0.36 + waveSpread×0.17)
rings     = stressed? 2 : noise? 6 : sine|tri? 3 : 4
stressed  = frameBudget > 50 ms OR nodeCount > 5

per ring k:
  phase  = (time × angSpeed + k/rings) % 1
  radius = nodeRadius + phase × maxRadius
  alpha  = volume × 0.17 × (1 - phase×0.88) × (playing ? 1 : 0.12)
```

### Gravity links

```
factor ≥ 0.04 → draw
lineWidth = factor × 2
color = gradient from type_a.color → type_b.color at opacity factor × 0.35
```

### Ripple decay

```
speed   = initSpeed × (1 - r/maxR)^0.45
radius += max(0.2, speed)
alpha  *= 0.962
remove if radius > maxR or alpha < 0.004
```

### Momentum pan

```
per frame: viewX += velX; velX *= 0.88
           viewY += velY; velY *= 0.88
stop if |vel| < 0.3
```

---

## 14. Spectrum Canvas

```
X = (log₂(hz) - log₂(8)) / (log₂(40000) - log₂(8)) × width
Y = (1 - (dB + 90) / 80) × height

Grid at -90, -60, -30 dB
Per-node FFT curve: type color, opacity 0.55
Master FFT curve: white/dark, opacity 0.75, lineWidth 2
Node markers: bar + circle at computed frequency X
```

---

## 15. Preset Format

```js
{
  name: string,
  v: 1,
  global: { vol, grav, tone, spread },  // 0–100 integers
  nodes: [{
    x, y,              // world coords (integers)
    filterNorm,        // 4 decimal places
    type,
    volume, muted, panOverride,
    attack, decay, sustain, release,
    reverbSend, delaySend,
    nodeDelayTime, nodeDelayFeedback, nodeDelayWet,
    typeParams,
    orbits,            // array of orbit objects
    steps,             // 16-element boolean[] (drum only)
  }]
}
```

Encoding: `JSON → TextEncoder → btoa → URL-safe base64 (+ → -, / → _, strip =)`

---

## 16. UI Views

`showView(name)` toggles `.active` on `#global-view #node-view #comet-view #fx-view`  
and `.on` on the corresponding toolbar button.

### Node panel tabs

| Tab | Contents |
|---|---|
| `sound` | Detune, vibrato rate/depth, voices, spread, noise color, resonance |
| `envelope` | Attack, Decay, Sustain, Release |
| `fx` | Reverb send, Delay send, node delay time/feedback/wet |
| `orbits` | Up to 3 orbit cards: target, rate, depth, direction, enable |

### Comet panel

Chip list → select comet → sliders: Orbit, Speed, Gravity, Shape, Fade, Permanent, Life display, Move-center

### FX panel

Lo Cut, Hi Cut, Reverb, Decay, Delay, Time, Feedback — all in bottom bar (`#fx-view`), not modal

---

## 17. PWA

- Canvas: `position:fixed; inset:0; touch-action:none`
- SW: `./sw.js` — offline cache
- Manifest: `display:standalone`, `orientation:any`, `theme_color:#08080e`
- Keep-alive: silent MP3 loop on play to keep AudioContext alive on lock screen
- `visibilitychange` → `Tone.context.resume()` on tab re-focus

---

## 18. Short Links & QR

- Base64 preset appended as `?p=…`
- Short link: 6-char alphanumeric in Supabase `short_links`, resolved via `?s=…`
- QR: `qrcode.js`, 200×200 px, dark `#e8e8f0`, transparent bg, error correction M

---

## 19. Analytics

- **Plausible:** `Preset generated`, `Play started/stopped`, `Node created`, `Short link created`, `JS error`, `Session end`
- **Supabase:** `js_error` via `navigator.sendBeacon`

---

## 20. Performance Targets

| Metric | Target |
|---|---|
| Frame rate | 30 FPS |
| Audio latency | ~50 ms (balanced context) |
| LFO update | 20 Hz (50 ms intervals) |
| Gravity physics | ~10 Hz (every 3 frames) |
| Spectrum update | 10 Hz (100 ms) |
| Recommended max nodes | 15–20 |
| Max comets | 5 |
