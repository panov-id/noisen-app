# Noisen

Quiet your mind with noise.

A minimal PWA for meditative sound generation. Place nodes on an infinite canvas — each node synthesizes sound based on its position. Nodes gravitationally influence each other, bending pitch and texture into generative ambient drones.

**Live:** [noisen.space](https://noisen.space) · No accounts. No distractions. Just sound.

---

## How it works

- **X axis** → frequency (8 Hz … ~40 kHz, logarithmic; fixed regardless of screen size or zoom)
- **Y axis** → filter cutoff (bottom = dark/filtered, top = bright/open)
- **X position** → stereo pan (left edge = −1, right edge = +1)
- **Node size** → volume (larger = louder)
- **Gravity** → nearby nodes pull each other's pitch; strength adjustable globally
- **Wave rings** → expand proportionally to frequency; spread controlled by filter cutoff

### Synthesis modes

| Type | Character |
|---|---|
| Sine | Pure tone |
| Triangle | Soft, hollow |
| Square | Buzzy, hollow |
| Sawtooth | Bright, rich harmonics |
| Noise | Pink / white / brown texture |

### Controls

| Control | Action |
|---|---|
| Tap empty canvas | Add node |
| Drag node | Reposition (changes pitch + filter) |
| Tap node | Open node panel |
| Drag background | Pan the workspace |
| Scroll / pinch | Zoom in/out |
| ▶ (topbar) | Play / Stop |
| ⚄ (topbar) | Generate random harmonic preset |
| Presets (topbar) | Save / load / share presets |
| Nodes (topbar) | All nodes overview |
| Reset view (topbar) | Return viewport to origin |
| ☰ (mobile) | All topbar controls in a dropdown |

---

## Features

### Per-node parameters

Each node has independent controls in its panel:

- **Wave type** — Sine / Triangle / Square / Sawtooth / Noise
- **Volume** — output level and visual size
- **Pan** — manual stereo position override
- **ADSR envelope** — Attack, Decay, Sustain, Release (applied on play/mute)
- **Filter cutoff** — lowpass filter independent of Y position
- **Vibrato** — rate + depth (Sine and Triangle)
- **Voice stacking** — up to 5 detuned voices with spread (Square / Sawtooth)
- **Noise color** — Pink / White / Brown (Noise type)
- **Node delay** — local echo with Time, Feedback, Wet
- **Reverb send** — amount routed to master reverb bus
- **Delay send** — amount routed to master delay bus

### Orbit modulation (LFO)

Each node supports up to **3 independent orbits**. Each orbit is an LFO that modulates a parameter continuously:

| Target | Effect |
|---|---|
| Filter | Sweeps the lowpass cutoff up and down |
| Pan | Auto-pans the node left and right |
| Volume | Tremolo — rhythmic amplitude pulsing |
| Delay | Pulses the local echo wet mix |

Controls per orbit: **Rate** (0.02–2 Hz) and **Depth** (0–100%). Orbits are visualised as dashed rings around the node with a moving dot — the dot position reflects the current LFO phase, and a short arc shows modulation depth.

### Master FX chain

Global effects accessible via the FX button:

- **Lo Cut** — highpass filter (removes sub-bass rumble)
- **Hi Cut** — lowpass filter (trims harsh highs)
- **Tone** — master lowpass color
- **Reverb** — wet + decay
- **Delay** — wet + time + feedback
- **Volume** — master output level

### Presets & sharing

Save your node configuration with a name. Share via URL — the entire state is encoded as compressed base64:

```
https://noisen.space/?p=<base64-encoded-preset>
```

No server, no account. Anyone who opens the link gets your exact setup.

### Recording

Record the audio output directly to a `.webm` file from the browser — no plugins needed. The recorder button (●) appears in the topbar next to the play button.

### PWA

- Installable on iOS, Android, and desktop
- Works fully offline after first visit
- Plays in silent mode (Web Audio API, no `<audio>` element)
- Responsive — portrait and landscape on all screen sizes

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES modules + Vite |
| Audio | Tone.js (Web Audio API) |
| Render | Canvas 2D |
| Build | Docker + Node 20 + Vite 5 |
| CDN | BunnyCDN (Storage Zone + Pull Zone) |
| Domain | noisen.space |

### Source structure

```
source/
  index.html              HTML shell
  styles/main.css         All styles
  javascript/
    store.js              Shared state, constants, persistence
    audio.js              Tone.js engine (nodes, LFOs, master chain)
    canvas.js             Rendering, hit testing, zoom/pan
    ui.js                 Panels, overlays, wizard, presets, tooltips
    main.js               Entry point — wires everything together
  public/
    sw.js                 Service worker (offline cache)
    manifest.json         PWA manifest
    icons/                App icons (SVG + PNG, maskable)
    marketing/            OG image, social banner
```

---

## Development

### Prerequisites

- Docker

### Build

Builds `source/` → `dist/` using a Docker container (no local Node required):

```bash
bash infrastructure/scripts/build.sh
```

### Deploy

Copy `.env.local.example` → `.env.local`, fill in BunnyCDN credentials, then:

```bash
source .env.local
bash infrastructure/scripts/deploy-cdn.sh
```

This builds first, then uploads `dist/` to the CDN and purges the pull zone cache.

### Tests

```bash
bash infrastructure/scripts/test-recording.sh    # recording button behaviour
bash infrastructure/scripts/test-font-sizes.sh   # font scaling in all overlays
```

Both run Playwright (Chromium) inside Docker — no local browser or Node needed.

---

## Assets

| File | Purpose |
|---|---|
| `icons/icon.svg` | App icon (any size, PWA + browser tab) |
| `icons/icon-maskable.svg` | Maskable icon for Android home screen |
| `marketing/og.png` | Open Graph image (1200×630) |
| `marketing/social-banner.png` | Twitter / GitHub social card (1280×640) |
