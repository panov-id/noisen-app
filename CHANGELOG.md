# Changelog

## [Unreleased] — concept phase

### 2026-06-10 — Concept iteration 18

#### Dark theme by default
- `<html data-theme="dark">` — app opens in dark theme instead of light
- Theme choice persisted to `localStorage` (`noisen-settings.theme`); reopening restores last selection

#### Settings persistence
- `loadSettings()` / `saveSettings(patch)` helpers write to `localStorage` key `noisen-settings`
- Persisted: `theme`, `largeText`, `vol`, `grav`, `tone`, `spread`
- On startup, saved global params are restored via `applyGlobal` (only if at least one was saved)
- Large text toggle now restores on page load (previously reset to off every time)

---

### 2026-06-09 — Concept iteration 17

#### Pan — removed auto-pan from X position
- `effectivePan(n)` now returns `n.panOverride ?? 0` (center) instead of mapping X world coordinate to stereo pan
- `autoPan` function removed entirely
- Pan is now exclusively controlled via the Pan slider in the node panel
- Nodes start centered (pan = 0) and only move in the stereo field when the user explicitly adjusts the slider

#### Audio performance — reduce glitches under CPU load
- `Tone.context.lookAhead = 0.3` — larger scheduling buffer (300ms) prevents audio dropout when CPU is busy
- `Tone.context.updateInterval = 0.05` — reduces Tone.js clock polling overhead
- Canvas render loop capped at 30fps: frames are skipped when less than 33ms elapsed since last frame
- Exponential moving average `frameBudgetMs` tracks actual frame duration to detect CPU stress
- Adaptive wave ring count in `drawNodeWaves`: reduces to 2 rings when `frameBudgetMs > 50` or more than 5 nodes active (otherwise: noise=6, sine/triangle=3, other=4)

---

### 2026-06-09 — Concept iteration 16

#### Onboarding wizard — rework
- Full-screen backdrop with blur (blocks all UI interaction while open)
- Card centered on screen via flexbox (not absolutely positioned above panel)
- 10 steps with detailed descriptions covering every interface element at ~95% depth:
  Welcome → X axis (frequency) → Y axis (filter) → Gravity → Wave types & node panel → Pan & stereo → Play button → Random harmonic → Save & share → Infinite canvas
- "← Back" button added; hidden on first step
- "?" button in topbar reopens wizard at any time
- `wizardOpen()` resets to step 0 each time
- Backdrop click does not close (intentional — forces reading or explicit Skip)

#### Default font size increased 1.5×
- `[data-large="0"]`: 13px → 15px base, 11px → 12px small, 10px → 11px extra-small
- `[data-large="1"]`: 15px → 18px base (large text toggle still works as before)

---

### 2026-06-09 — Concept iteration 15

#### Onboarding wizard
- Shown on first visit only (dismissed state stored in `localStorage`)
- 6 steps: Welcome → Position = sound → Gravity → Play → Random harmonic → Save & share
- Progress bar (pip dots) at top of card shows current position
- Each step highlights the relevant UI element with a glow ring (`.wizard-ring` class)
- "Next →" / "Let's go ✓" button advances; "Skip intro" dismisses immediately
- Card floats above bottom panel, centered; fade+slide out on close
- Wizard element hidden via `display:none` after close (no layout cost)

---

### 2026-06-09 — Concept iteration 14

#### PNG icon generation
- `infrastructure/docker/Dockerfile.icons` — minimal Debian image with `librsvg2-bin` (`rsvg-convert`)
- `infrastructure/scripts/generate-icons.sh` — builds Docker image, converts all SVGs to PNG:
  - `icons/icon-192.png`, `icons/icon-512.png`
  - `icons/icon-maskable-192.png`, `icons/icon-maskable-512.png`
  - `marketing/og.png` (1200×630), `marketing/social-banner.png` (1280×640)
- `manifest.json` updated: PNG icons listed first (192 + 512 for both `any` and `maskable`), SVG fallback kept
- `concept.html` updated: `apple-touch-icon` now points to `icon-192.png` (iOS Safari requires PNG)
- `sw.js` updated: all four PNG icons added to precache list
- `deploy-cdn.sh` updated: uploads PNG icons and marketing PNGs automatically

---

### 2026-06-09 — Concept iteration 13

#### Play button — moved to topbar
- Play/stop button relocated from left column to topbar (between other icon buttons)
- Freed the entire 72px-wide play column — bottom panel is now full-width for parameters
- Button is now 32×32px (icon button style, consistent with other topbar controls)
- Icons toggled via `display` swap instead of `innerHTML` re-injection
- `syncCount()` now updates the analytics strip node count directly

#### Mobile sliders — wrap to 2-column grid
- With play column gone, parameter area is ~72px wider on all screen sizes
- On ≤480px: param cards wrap to 2-column grid (`flex-wrap: wrap`)
- Each card takes `calc(50% - 4px)` — sliders are full-width within their column

#### PWA
- `manifest.json` added: name, icons, theme color, display standalone, orientation any
- `sw.js` service worker: stale-while-revalidate caching; full offline support after first load
- Meta tags added to `concept.html`: manifest link, apple-touch-icon, og:*, twitter:card, theme-color
- Service worker registered at end of script

#### Icons
- `icons/icon.svg` — concentric-rings icon matching in-app wave visualization; SVG any-size
- `icons/icon-maskable.svg` — same design, no rounded corners, safe area centered (for Android)

#### Marketing assets
- `marketing/og.svg` — Open Graph image 1200×630 with three animated-style nodes + wordmark
- `marketing/social-banner.svg` — GitHub/Twitter banner 1280×640 with feature list + domain

#### Deployment — BunnyCDN
- `infrastructure/scripts/deploy-cdn.sh` — uploads static files to BunnyCDN Storage Zone via HTTP PUT; optional pull-zone cache purge
- `infrastructure/scripts/purge-cdn.sh` — cache purge only
- Required env vars: `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE`; optional: `BUNNY_STORAGE_REGION`, `BUNNY_PULL_ZONE_ID`
- README updated: live domain `noisen.space`, deployment instructions, asset table

---

### 2026-06-09 — Concept iteration 12

#### Random harmonic preset generator
- New button in topbar (shuffle-arrows icon) generates a full preset from a random musical scale
- Picks a random root note (C–B, octave 3–4) and one of 8 modes: Major, Minor, Pentatonic, Minor pentatonic, Dorian, Mixolydian, Lydian, Phrygian
- Places 3–6 nodes at frequencies matching notes of the chosen scale, spread across 1–2 octaves
- Node X derived from exact note frequency via `freqToWorldX(freq)` — inverse of `freqFromX`
- Node Y placed in upper-mid canvas zone (bright filter) for pleasant harmonic texture
- Node types weighted toward sine/triangle; occasional square for colour
- Each node gets ±8 cents random detune for warmth without dissonance
- Gravity set to 20–40% (light) to preserve harmonic intervals
- Toast notification shows scale info: e.g. "A3 Dorian — 5 nodes"
- Preset name input pre-filled with scale name for quick save

---

### 2026-06-09 — Concept iteration 11

#### Presets — save, load, share
- New Presets button in topbar (floppy-disk icon) opens a modal sheet
- Save row: name input + Save button stores current state to `localStorage`
- Share button (current state): generates a URL with `?p=<base64>` and copies to clipboard
- Saved presets list: each entry shows node count, Load / Share / Delete buttons
- Share per-preset: each saved preset gets its own share button
- Clipboard confirmation banner appears for 2.2s after copying
- URL auto-load: opening a `?p=` link automatically applies the preset on page load
- Encoding: JSON → UTF-8 bytes → URL-safe base64 (no external dependencies); typical 5-node preset ≈ 400 chars

#### Preset data format (v1)
```json
{ "name":"…", "v":1,
  "global":{"vol":70,"grav":50,"tone":60,"spread":40},
  "nodes":[{"x":…,"y":…,"type":"sine","volume":0.55,"muted":false,
             "panOverride":null,"typeParams":{…}}] }
```

#### Responsive — cards wrap on mobile
- Global and node param cards now wrap to 2-column grid on ≤ 480px screens
- No horizontal scroll needed for sliders on portrait phones; each card takes ~50% width

---

### 2026-06-09 — Concept iteration 10

#### Responsive design — mobile portrait
- CSS media query at ≤ 480px covers all phone portrait orientations
- Topbar: GitHub link hidden on mobile, reduced gaps, larger touch targets
- Bottom panel: height increases to 228px via `--panel-h` CSS variable on mobile
- `PANEL_H` is now dynamic in JS — reads actual `#bottom` height on every resize, so canvas math stays correct regardless of CSS-controlled panel height
- Type buttons in node view: label text hidden on mobile, icon-only mode
- Analytics strip and node info strip: horizontal scroll instead of overflow-clip
- Slider thumbs: 20px on mobile, 22px on coarse-pointer (touch) devices — easier to drag
- Action buttons: larger touch area on mobile
- Nodes overview sheet: full-width on mobile, filter column hidden to reduce clutter

---

### 2026-06-09 — Concept iteration 9

#### Fixed frequency scale invariance
- Introduced `WORLD_WIDTH = 1920` constant as the fixed reference for frequency mapping
- `freqFromX(wx)` and `autoPan(wx)` now divide by `WORLD_WIDTH` instead of `canvas.width`
- Resizing the window or rotating the device no longer shifts node frequencies or pan positions
- Node world-X position is the sole determinant of its frequency; screen size is irrelevant

#### Nodes overview overlay
- New button in topbar (list icon) opens an overlay listing all nodes
- Each row: color dot, node ID, wave type icon + name, live frequency, filter cutoff, volume, muted badge
- Clicking a row selects that node and closes the overlay
- Clicking the backdrop or × button closes the overlay
- Empty state shown when no nodes exist

---

### 2026-06-09 — Concept iteration 8

#### Pannable canvas workspace
- Nodes now live in world coordinates; viewport can be panned freely
- Drag on empty canvas area to pan the view
- Momentum/inertia after releasing pan — velocity decays at 0.88 per frame
- Tapping empty area still creates a new node at that world position
- Subtle dot grid scrolls with the view to indicate infinite space
- Origin cross marker visible when viewport is near (0, 0)
- Coordinate readout (x, y) shown in top-right corner when view is offset
- Reset view button in topbar (crosshair icon) — cubic-ease animation back to origin
- Works well in portrait orientation: the workspace is larger than the screen

---

### 2026-06-09 — Concept iteration 7

#### Node control — moved to panel
- Radial floating menu removed entirely
- Tapping a node opens the node view in the bottom panel
- Node view header: color dot + label + wave type buttons (icons + text) + Mute + Delete + Close
- Changing wave type via type buttons in panel (no floating menu needed)
- Right-click still selects node (alternative for mouse users)

#### Frequency spectrum visualization
- Horizontal log-scale spectrum bar (8Hz … 40kHz) always visible in global view
- Active nodes shown as colored vertical bars at their current frequency
- Bar height proportional to volume, color matches wave type
- Dot at tip of each bar for precise position reading
- Dashed line at each node's filter cutoff frequency
- Human hearing range (20Hz–20kHz) subtly highlighted
- Tick labels at 20Hz, 100Hz, 1kHz, 10kHz, 20kHz
- Spectrum updates in the draw loop (~10fps)

#### Analytics strip (global view)
- Live strip showing: node count, active frequency range, gravity connection count, pan spread descriptor, gravity strength
- Frequency range shows lowest and highest active node frequencies
- Pan spread: narrow / med / wide / full based on stereo distribution

#### Node info strip (node view)
- Live stats row in node view: Freq, Filter, Pan, Gravity pull %, Volume
- Updates every 100ms while node is selected

#### Removed
- All floating radial menu code removed (CSS, HTML, JS)

---

### 2026-06-09 — Concept iteration 6

#### UI redesign — unified bottom panel
- Bottom area rebuilt as single unified panel (158px); separate toolbar removed
- Left column: play button + node count — always visible
- Right area: parameter cards in two views:
  - **Global view** (no node selected): Master Volume, Gravity, Tone, Spread
  - **Node view** (node selected): node header with color dot + freq badge + ×, then node cards
- Node cards: Volume, Pan, and type-specific params (all as cards, same visual language)
- Card design: icon + value top row, full-width slider with filled track, label bottom
- Card slider fill color tracks value via CSS `--pct` variable (no JS canvas needed)
- Node accent color applied to all card borders and slider thumbs when node is selected
- Smooth crossfade between global and node views (opacity + translateY transition)
- Noise color selector redesigned as in-card button group with active state

#### Removed
- Contrast theme removed (only light/dark toggle remains)

---

### 2026-06-09 — Concept iteration 5

#### UI / UX
- Node panel repositioned as fixed strip above bottom toolbar (no floating, no overlap)
- Close (×) button in panel — explicit exit from node selection mode
- When node selected: tapping empty canvas deselects without creating new node
- When node selected: tapping other node switches selection; canvas actions blocked until deselected
- Theme switcher: one button cycles contrast → light → dark → contrast (no 4-button row)
- Large text toggle: independent font-size bump, does not change colors
- Default theme changed to contrast

#### Audio — extended wave type settings
- Sine / Triangle: Detune (cents), Vibrato rate (Hz), Vibrato depth (cents) via Tone.Vibrato
- Square / Sawtooth: Detune (cents), Voices (1–5 detuned copies via FatOscillator), Spread (cents between voices)
- Noise: Color selector (white / pink / brown), Resonance / Filter Q (0.5–20)
- Triangle waveform added as fifth type

#### Wave visualization
- Triangle wave color: teal (#1fa0aa)
- Ring count for triangle = 3 (same as sine, smooth character)

---

### 2026-06-09 — Concept iteration 4

#### Top bar
- GitHub repository link button
- PWA install prompt button (shown only when browser supports install)
- Theme switcher: Light / Dark / Contrast / Large text
- CSS custom properties for all themes; canvas wave blend mode switches per theme

#### Node controls
- Right-click on node opens radial menu (in addition to left-click tap)
- Pan override per node: independent slider in analytics panel, decoupled from X-position auto-pan
- Volume ring arc drawn around node edge (clockwise proportion = volume level)

#### Node analytics panel
- Floating card shows: type, frequency, filter cutoff, pan, volume, mute state
- Volume slider in panel (live update)
- Pan slider in panel (overrides X-axis auto-pan)
- Type-specific settings: Detune (sine/square/sawtooth), Noise color picker (white/pink/brown)
- Gravity connections list: shows each nearby node with pull strength bar
- Panel repositions to stay inside viewport

#### Audio
- Frequency range extended to 8 Hz … ~40 kHz (includes ultrasonic; left=sub, right=ultrasonic)
- Filter range unchanged: 30 Hz … 22 kHz (Y axis)
- Noise color (white/pink/brown) selectable from node panel

#### Wave visualization — fixed per-node isolation
- Each node's wave field now drawn independently to main canvas (no shared offscreen canvas)
- Wave fields no longer contaminate each other's colors
- Blend mode switches per theme (multiply for light, screen for dark)

#### Bottom toolbar
- All slider labels replaced with SVG icons
- Tooltips on all interactive elements (hover shows title + description)

---

### 2026-06-09 — Concept iteration 3

#### Visual
- Light theme (warm off-white background, dark ink palette)
- SVG icons in radial menu — no text labels
- Node size now reflects volume (larger = louder)
- Pan indicator: small dot on track below each node shows stereo position

#### Audio
- Sound range extended to full audible spectrum: 10 Hz … 22 kHz (X axis, log scale)
- Filter range: 30 Hz … 22 kHz (Y axis)
- Per-node stereo panning: X position maps to pan (-1 … +1)
- Per-node volume: controls both node radius and audio gain

#### Wave visualization — mathematically tied to audio
- Ring expansion speed ∝ node frequency (higher pitch = faster rings)
- Ring spread radius ∝ filter cutoff / Y position (bright nodes = wider field)
- Ring opacity ∝ node volume (louder = more visible)
- Ring count per node varies by waveform type (sine=3, noise=5, square/saw=4)
- Ripple spawn interval ∝ frequency (high pitch = shorter interval between pulses)
- Wave fields blend with multiply compositing — interference between overlapping nodes is visible

#### Radial menu
- Rebuilt as icon-only circular menu around the node
- Volume up / volume down buttons (keep menu open for repeated taps)
- Mute / unmute toggle with live icon swap
- Active waveform type highlighted

---

### 2026-06-09 — Concept iteration 2

- Bottom toolbar: volume, gravity, tone, spread sliders + node counter
- Ripple rings emanating from nodes
- Colored gradient links between gravitationally connected nodes
- Node context menu replaced with radial menu (buttons around node)

---

### 2026-06-09 — Concept iteration 1

- Full-screen canvas, dark theme
- Click to add permanent nodes
- Drag nodes to reposition
- Tap node → context menu (waveform type, mute, delete)
- Gravitational synthesis: nearby nodes pull each other's pitch
- X → frequency, Y → filter cutoff
- Tone.js audio engine: sine / square / sawtooth / pink noise
- Pulse animation on nodes when playing

---

### 2026-06-09 — Infrastructure

- Supabase self-hosted via Docker Compose (official configuration)
- PostgreSQL schema: `sessions`, `presets`, `events`
- Row Level Security policies for anonymous access
- JWT key generation in `setup.sh`
- Helper scripts: `status`, `ping-api`, `logs`, `migrate`, `stop`, `reset`
- Kong API gateway on port 8000, Studio on port 8080
