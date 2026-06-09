# Noisen

Quiet your mind with noise.

A minimal PWA for meditative sound generation. Place nodes on a canvas — each node synthesizes sound based on its position. Nodes gravitationally influence each other, bending pitch and texture.

**Live:** [noisen.space](https://noisen.space) · No accounts. No distractions. Just sound.

---

## Concept

- **X axis** → frequency (8 Hz … ~40 kHz, log scale; fixed regardless of screen size)
- **Y axis** → filter cutoff (dark at bottom = filtered, bright at top = open)
- **X position** → stereo pan (left edge = −1, right edge = +1)
- **Node size** → volume (larger = louder)
- **Gravity** → nearby nodes pull each other's pitch; strength is adjustable
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
| Tap node | Open node panel (type, volume, params) |
| Drag background | Pan the workspace |
| ▶ (topbar) | Play / Stop |
| 🎲 (topbar) | Generate random harmonic preset |
| 💾 (topbar) | Save / load / share presets |
| ⊞ (topbar) | All nodes overview |
| ⊕ (topbar) | Reset viewport to origin |

---

## PWA

Noisen is installable as a Progressive Web App:

- Works fully offline after first visit
- Add to home screen on iOS / Android
- Plays in silent mode (Web Audio, no `<audio>` element)
- Responsive: works in portrait and landscape on all screen sizes

---

## Presets & sharing

Save your current node configuration with a name. Share presets via URL:

```
https://noisen.space/?p=<base64-encoded-preset>
```

Preset data is encoded as URL-safe base64 JSON — no server required, no login.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Svelte + Vite (planned) · `concept.html` prototype |
| Audio | Tone.js (Web Audio API) |
| Render | Canvas 2D |
| CDN | BunnyCDN (Storage Zone + Pull Zone) |
| Domain | noisen.space |
| Backend | Supabase self-hosted (Docker Compose) |
| Database | PostgreSQL with Row Level Security |

---

## Local development

### Prerequisites

- Docker + Docker Compose

### Start Supabase infrastructure

```bash
cd infrastructure
./setup.sh
```

| Service | URL |
|---|---|
| Supabase Studio | http://localhost:8080 |
| API (Kong) | http://localhost:8000 |

### Helper scripts

```bash
./scripts/status.sh          # container status
./scripts/ping-api.sh        # smoke test the API
./scripts/logs.sh <service>  # logs for a service
./scripts/migrate.sh         # apply database migrations
./scripts/stop.sh            # stop all containers
./scripts/reset.sh           # stop + delete volumes
```

### Open the prototype

Open `concept.html` directly in a browser — no build step needed.

---

## Deployment (BunnyCDN)

Set environment variables, then run the deploy script:

```bash
export BUNNY_STORAGE_API_KEY=<your-storage-api-key>
export BUNNY_STORAGE_ZONE=<your-zone-name>
export BUNNY_STORAGE_REGION=de          # de | ny | la | sg | syd
export BUNNY_PULL_ZONE_ID=<zone-id>     # optional — enables cache purge

./infrastructure/scripts/deploy-cdn.sh
```

To purge cache only (without re-uploading files):

```bash
./infrastructure/scripts/purge-cdn.sh
```

---

## Database schema

```
sessions  — anonymous user sessions
presets   — node configurations; public or private
events    — analytics events (type + payload)
```

Row Level Security enabled. Anonymous users can read public presets and insert their own.

---

## Assets

| File | Purpose |
|---|---|
| `icons/icon.svg` | App icon (any size, for PWA + browser tab) |
| `icons/icon-maskable.svg` | Maskable icon for Android home screen |
| `marketing/og.svg` | Open Graph image (1200×630) |
| `marketing/social-banner.svg` | GitHub social / Twitter card (1280×640) |
