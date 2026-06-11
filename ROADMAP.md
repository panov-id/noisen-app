# Noisen — Technical Roadmap

All planned work goes here first. Nothing gets built until it's on the roadmap.
Status: `planned` · `in-progress` · `done` · `cancelled`

---

## Active bugs

| # | Status | Area | Description |
|---|---|---|---|
| B-01 | planned | Audio | Crackling/clicks on drum hits — shared synth pan changes cause discontinuities |
| B-02 | planned | Audio | Filter frequency changes when screen size / orientation changes — filterNorm tied to canvas.height |
| B-03 | planned | Interface | Portrait mode: too many text labels in topbar and node panel — needs icon-only layout |

---

## Planned features

| # | Status | Area | Description |
|---|---|---|---|
| F-01 | planned | Infrastructure | GitHub Actions CI/CD — auto-deploy UAT on push to main, production on tag |
| F-02 | planned | Testing | Interface responsiveness tests — portrait / landscape panel layout |
| F-03 | planned | Testing | Audio filter stability test — place node, resize viewport, assert filterNorm unchanged |
| F-04 | planned | Testing | Node interaction tests — drag, step toggle, orbit enable |
| F-05 | planned | Beat mode | Swing / groove — per-step timing offset (0–50%) |
| F-06 | planned | Beat mode | Mute per step — hold step to cycle off / soft / on |
| F-07 | planned | Ambient | Chord mode — place multiple ambient nodes locked to a musical interval |
| F-08 | planned | Sharing | Preset URL shortener — /s/xyz instead of base64 blob |
| F-09 | planned | Interface | Undo/redo — Cmd+Z for node add/remove/move |

---

## Done (by version)

### v3.0 — Beat mode drum sequencer
- Beat mode (♩ button) with BPM-locked Transport
- Five drum node types: Kick · Snare · Hihat · Clap · Perc
- 16-step sequencer grid per node (1×16 portrait, 8+8 landscape)
- Type-specific synthesis params: tune / decay / pitchDecay / tone / open
- Per-type drumPanners with rampTo (avoids pan-click artifacts)
- Drum orbit LFOs — volume and pan targets via createDrumOrbitLFO
- Tabbed drum panel: Sound / Steps / FX / Orbits
- Drag reaction for drum nodes: X → tune, Y → decay
- 2ms type-offset for same-type nodes on same beat step
- Gravity throttled to every 3rd frame
- BPM step 5 → 1
- 14 ambient archetypes with anti-repeat and wider frequency ranges
- Beat presets: drum-only · drum+bass · drum+pad · drum+drone · drum+texture
- Orbit direction randomized across all preset archetypes (↻ / ↺)
- Marketing assets regenerated (og, social-banner)

### v2.3 — Orbit direction + wave physics
- ↻ / ↺ toggle per orbit LFO
- Wave ring speed tied to filter openness
- Ring expansion decelerates naturally

### v2.2 — Rhythmic archetypes
- Polyrhythm, Gamelan, Pentatonic pulse, Fibonacci / φ, Drone swarm archetypes
- Wave rings emit frequency-proportional

### v2.1 — Smart presets + fullscreen
- 5 intentional archetypes: Binaural, Solfeggio, Harmonic series, Full spectrum, Scale
- Orbit LFO engine rewritten (no more audio dropouts)
- Fullscreen button

### v2.0 — Orbits + tabbed node panel
- Per-node orbit LFOs: Filter / Pan / Volume / Delay
- Tabbed node panel: Sound · Envelope · FX · Orbits

### v1.9 — UI polish + modular codebase
- Text scaling with large/small toggle
- ES modules split: store, audio, canvas, ui, main
- Vite build pipeline via Docker

### v1.8 — ADSR envelope per node

### v1.7 — Bigger UI + hamburger + per-node delay

### v1.6 — Canvas zoom (×0.25–×4)

### v1.5 — Master FX chain + frequency response

### v1.4 — Settings persist + dark theme

### v1.3 — Background audio + onboarding wizard

---

## Process

1. Add item to roadmap with status `planned`
2. Move to `in-progress` when work starts
3. Move to `done` when merged and deployed
4. Reference roadmap item number in commit messages: `fix B-02: filterNorm screen-size independence`
