// ── Canvas drawing, hit testing, zoom/pan ─────────────────────

import {
  state, TYPES, WORLD_WIDTH, TOP_H, NODE_MIN_R, NODE_MAX_R, ZOOM_MIN, ZOOM_MAX,
} from './store.js';
import {
  nodeFreq, nodeRadius, effectivePan, gravityFactor, filterFromNorm,
  createAudio, updateAudio, destroyAudio,
  masterAnalyser,
} from './audio.js';

export const canvas = document.getElementById('main');
export const context = canvas.getContext('2d');

// ── Viewport math ─────────────────────────────────────────────
export function screenToWorld(screenX, screenY) {
  return { x: screenX / state.zoom + state.viewX, y: screenY / state.zoom + state.viewY };
}

export function worldToScreen(worldX, worldY) {
  return { x: (worldX - state.viewX) * state.zoom, y: (worldY - state.viewY) * state.zoom };
}

export function applyZoom(newZoom, pivotScreenX, pivotScreenY) {
  newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  const worldX = pivotScreenX / state.zoom + state.viewX;
  const worldY = pivotScreenY / state.zoom + state.viewY;
  state.zoom = newZoom;
  state.viewX = worldX - pivotScreenX / state.zoom;
  state.viewY = worldY - pivotScreenY / state.zoom;
}

export function computeFilterNorm(screenY) {
  return Math.max(0, Math.min(1, (screenY - TOP_H) / (canvas.height - state.panelHeight - TOP_H)));
}

// ── Hit testing ───────────────────────────────────────────────
export function hitTest(clientX, clientY) {
  const { x: worldX, y: worldY } = screenToWorld(clientX, clientY);
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const node = state.nodes[i];
    if (Math.hypot(worldX - node.x, worldY - node.y) <= nodeRadius(node) + 10 / state.zoom) {
      return node;
    }
  }
  return null;
}

// ── Ripples ───────────────────────────────────────────────────
export function spawnRipple(node) {
  const freq    = nodeFreq(node);
  const filterNorm = 1 - (node.filterNorm ?? 0.5);
  const maxRadius = Math.hypot(canvas.width, canvas.height) * (.05 + filterNorm * .38 + state.waveSpread * .2);
  const speed   = .4 + Math.log2(Math.max(1, freq / 10)) * .45;
  state.ripples.push({
    x: node.x, y: node.y, rgb: TYPES[node.type].rgb,
    radius: nodeRadius(node), maxRadius, alpha: .12 + node.volume * .25, speed,
  });
}

export function rippleInterval(node) {
  return Math.max(14, 115 - Math.log2(Math.max(1, nodeFreq(node) / 10)) * 8.5);
}

// ── Wave rings around node ────────────────────────────────────
let frameBudgetMs = 33;
export function setFrameBudget(ms) { frameBudgetMs = ms; }

export function drawNodeWaves(node, time) {
  const [r, g, b] = TYPES[node.type].rgb;
  const freq      = nodeFreq(node);
  const filterNorm = Math.max(0, 1 - (node.y - TOP_H) / (canvas.height - state.panelHeight - TOP_H));
  const angSpeed  = .0005 + Math.log2(Math.max(1, freq / 10)) * .00055;
  const maxRadius = Math.hypot(canvas.width, canvas.height) * (.06 + filterNorm * .36 + state.waveSpread * .17);
  const stressed  = frameBudgetMs > 50 || state.nodes.length > 5;
  const rings     = stressed ? 2 : node.type === 'noise' ? 6 : (node.type === 'sine' || node.type === 'triangle') ? 3 : 4;
  const R         = nodeRadius(node);

  for (let k = 0; k < rings; k++) {
    const phase = (time * angSpeed + k / rings) % 1;
    const radius = R + phase * maxRadius;
    const alpha  = node.volume * .17 * (1 - phase * .88) * (state.isPlaying ? 1 : .12);
    if (alpha < .003) continue;
    const gradient = context.createRadialGradient(node.x, node.y, radius * .72, node.x, node.y, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha * .65})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.beginPath();
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fillStyle = gradient;
    context.fill();
  }
}

// ── Gravity links between nodes ───────────────────────────────
export function drawLinks() {
  for (let i = 0; i < state.nodes.length; i++) {
    for (let j = i + 1; j < state.nodes.length; j++) {
      const a = state.nodes[i], b = state.nodes[j];
      const f = gravityFactor(a, b);
      if (f < .04) continue;
      const [ar, ag, ab] = TYPES[a.type].rgb;
      const [br, bg, bb] = TYPES[b.type].rgb;
      const gradient = context.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, `rgba(${ar},${ag},${ab},${f * .35})`);
      gradient.addColorStop(1, `rgba(${br},${bg},${bb},${f * .35})`);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = gradient;
      context.lineWidth = f * 2;
      context.stroke();
    }
  }
}

// ── Ripple drawing ────────────────────────────────────────────
export function drawRipples() {
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const rip = state.ripples[i];
    rip.radius += rip.speed;
    rip.alpha  *= .965;
    if (rip.radius > rip.maxRadius || rip.alpha < .004) {
      state.ripples.splice(i, 1);
      continue;
    }
    const [r, g, b] = rip.rgb;
    const progress  = rip.radius / rip.maxRadius;
    context.beginPath();
    context.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${r},${g},${b},${rip.alpha * (1 - progress * .6)})`;
    context.lineWidth = 1.2 * (1 - progress * .45);
    context.stroke();
  }
}

// ── Single node drawing ───────────────────────────────────────
export function drawNode(node, time) {
  const { color, rgb } = TYPES[node.type];
  const [r, g, b] = rgb;
  const R     = nodeRadius(node);
  const pulse = state.isPlaying && !node.muted
    ? Math.sin(time * .003 + node.pulsePhase) * .28 + .72
    : .28;
  const isSelected = node === state.selectedNode;

  if (isSelected) {
    context.beginPath();
    context.arc(node.x, node.y, R + 7, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${r},${g},${b},.25)`;
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    context.stroke();
    context.setLineDash([]);
  }

  context.shadowColor = `rgba(${r},${g},${b},.14)`;
  context.shadowBlur  = R * 1.4;
  const disc = context.createRadialGradient(node.x, node.y, 0, node.x, node.y, R);
  disc.addColorStop(0, `rgba(${r},${g},${b},${node.muted ? .05 : pulse * .26})`);
  disc.addColorStop(1, `rgba(${r},${g},${b},.01)`);
  context.beginPath();
  context.arc(node.x, node.y, R, 0, Math.PI * 2);
  context.fillStyle = disc;
  context.fill();
  context.shadowBlur = 0;

  context.beginPath();
  context.arc(node.x, node.y, R, 0, Math.PI * 2);
  context.strokeStyle = node.muted
    ? 'rgba(128,125,120,.28)'
    : `rgba(${r},${g},${b},${pulse * .8 + .2})`;
  context.lineWidth = 1.8;
  context.stroke();

  // volume arc
  if (!node.muted && node.volume > .05) {
    context.beginPath();
    context.arc(node.x, node.y, R + 5, -Math.PI / 2, -Math.PI / 2 + node.volume * Math.PI * 2);
    context.strokeStyle = `rgba(${r},${g},${b},.35)`;
    context.lineWidth = 2.2;
    context.stroke();
  }

  // pan track
  const pan    = effectivePan(node);
  const trackW = R * 1.3;
  const dotX   = node.x + pan * trackW;
  const dotY   = node.y + R + 10;
  context.beginPath();
  context.moveTo(node.x - trackW, dotY);
  context.lineTo(node.x + trackW, dotY);
  context.strokeStyle = `rgba(${r},${g},${b},.17)`;
  context.lineWidth = 1;
  context.stroke();
  context.beginPath();
  context.arc(dotX, dotY, 2.8, 0, Math.PI * 2);
  context.fillStyle = `rgba(${r},${g},${b},.5)`;
  context.fill();

  // id label
  context.font = `${Math.max(9, Math.round(R * .42))}px SF Mono,Fira Code,monospace`;
  context.fillStyle = node.muted
    ? 'rgba(128,125,120,.38)'
    : `rgba(${r},${g},${b},.55)`;
  context.textAlign    = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${node.id}`, node.x, node.y);
  context.textAlign    = 'left';
  context.textBaseline = 'alphabetic';

  context.beginPath();
  context.arc(node.x, node.y, 2.2, 0, Math.PI * 2);
  context.fillStyle = node.muted ? 'rgba(128,125,120,.25)' : color;
  context.fill();
}

// ── Grid background ───────────────────────────────────────────
export function drawGrid() {
  const worldStep  = 120;
  const screenStep = worldStep * state.zoom;
  const color      = state.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(40,35,30,0.04)';
  context.strokeStyle = color;
  context.lineWidth   = 1;

  const startX = -(((state.viewX * state.zoom) % screenStep) + screenStep) % screenStep;
  for (let x = startX; x <= canvas.width; x += screenStep) {
    context.beginPath();
    context.moveTo(x, TOP_H);
    context.lineTo(x, canvas.height - state.panelHeight);
    context.stroke();
  }

  const startY = -(((state.viewY * state.zoom) % screenStep) + screenStep) % screenStep;
  for (let y = startY + TOP_H; y <= canvas.height - state.panelHeight; y += screenStep) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  // origin cross
  const ox = -state.viewX * state.zoom;
  const oy = -state.viewY * state.zoom;
  if (ox > -10 && ox < canvas.width + 10 && oy > TOP_H - 10 && oy < canvas.height - state.panelHeight + 10) {
    const crossColor = state.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(40,35,30,0.12)';
    context.strokeStyle = crossColor;
    context.lineWidth   = 1;
    context.beginPath(); context.moveTo(ox - 12, oy); context.lineTo(ox + 12, oy); context.stroke();
    context.beginPath(); context.moveTo(ox, oy - 12); context.lineTo(ox, oy + 12); context.stroke();
  }
}

// ── View position indicator ───────────────────────────────────
export function drawViewIndicator() {
  const hasOffset = Math.abs(state.viewX) >= 20 || Math.abs(state.viewY) >= 20;
  const hasZoom   = Math.abs(state.zoom - 1) >= 0.05;
  if (!hasOffset && !hasZoom) return;
  context.save();
  context.font         = '9px SF Mono,Fira Code,monospace';
  context.fillStyle    = state.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(40,35,30,0.22)';
  context.textAlign    = 'right';
  context.textBaseline = 'top';
  const parts = [];
  if (hasOffset) parts.push(`${Math.round(state.viewX)}, ${Math.round(state.viewY)}`);
  if (hasZoom)   parts.push(`×${state.zoom.toFixed(2)}`);
  context.fillText(parts.join('  '), canvas.width - 10, TOP_H + 8);
  context.restore();
}

// ── Spectrum canvas ───────────────────────────────────────────
const spectrumCanvas  = document.getElementById('spectrum-canvas');
const spectrumContext = spectrumCanvas.getContext('2d');

const LOG_MIN = Math.log2(8), LOG_MAX = Math.log2(40000);
function freqToSpecX(hz, width) {
  return (Math.log2(Math.max(8, hz)) - LOG_MIN) / (LOG_MAX - LOG_MIN) * width;
}

const SPEC_TICKS  = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const TICK_LABELS = { 20: '20', 100: '100', 1000: '1k', 10000: '10k', 20000: '20k' };

const DB_MIN = -90, DB_MAX = -10;
function dbToY(db, height) {
  return Math.max(0, Math.min(height, (1 - (db - DB_MIN) / (DB_MAX - DB_MIN)) * height));
}

function drawFftCurve(data, width, height, color, alpha, lineWidth = 1.5) {
  const binCount = data.length;
  const nyquist  = Tone.context.sampleRate / 2;
  spectrumContext.beginPath();
  let first = true;
  for (let i = 1; i < binCount; i++) {
    const hz = (i / binCount) * nyquist;
    if (hz < 8 || hz > 40000) continue;
    const x = freqToSpecX(hz, width);
    const y = dbToY(data[i], height);
    if (first) { spectrumContext.moveTo(x, y); first = false; }
    else spectrumContext.lineTo(x, y);
  }
  spectrumContext.strokeStyle = color.replace(')', `,${alpha})`).replace('rgb(', 'rgba(');
  spectrumContext.lineWidth   = lineWidth;
  spectrumContext.stroke();
}

export function drawSpectrum() {
  const width   = spectrumCanvas.width;
  const height  = spectrumCanvas.height;
  const labelHeight = 13;
  const curveHeight = height - labelHeight;

  spectrumContext.clearRect(0, 0, width, height);

  const bgColor = state.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(40,35,30,0.04)';
  spectrumContext.fillStyle = bgColor;
  spectrumContext.fillRect(0, 0, width, height);

  const textColor = state.isDark ? 'rgba(255,255,255,0.2)'  : 'rgba(40,35,30,0.25)';
  const tickColor = state.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(40,35,30,0.07)';
  const dbGrid    = state.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(40,35,30,0.05)';

  // dB grid lines
  [-90, -60, -30].forEach(db => {
    const y = Math.round(dbToY(db, curveHeight));
    spectrumContext.strokeStyle = dbGrid;
    spectrumContext.lineWidth   = 1;
    spectrumContext.beginPath();
    spectrumContext.moveTo(0, y);
    spectrumContext.lineTo(width, y);
    spectrumContext.stroke();
  });

  // human hearing region highlight
  const xHear1 = freqToSpecX(20, width), xHear2 = freqToSpecX(20000, width);
  spectrumContext.fillStyle = state.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(40,35,30,0.02)';
  spectrumContext.fillRect(xHear1, 0, xHear2 - xHear1, curveHeight);

  // tick lines
  SPEC_TICKS.forEach(hz => {
    const x = Math.round(freqToSpecX(hz, width));
    spectrumContext.strokeStyle = tickColor;
    spectrumContext.lineWidth   = 1;
    spectrumContext.beginPath();
    spectrumContext.moveTo(x, 0);
    spectrumContext.lineTo(x, curveHeight);
    spectrumContext.stroke();
  });

  // per-node FFT curves (real-time when playing)
  if (state.isPlaying) {
    for (const node of state.nodes) {
      if (node.muted || !node.audio?.analyser) continue;
      const data = node.audio.analyser.getValue();
      const [r, g, b] = TYPES[node.type].rgb;
      const filterCutoffX = freqToSpecX(filterFromNorm(node.filterNorm ?? 0.5), width);
      spectrumContext.setLineDash([2, 3]);
      spectrumContext.strokeStyle = `rgba(${r},${g},${b},0.18)`;
      spectrumContext.lineWidth   = 1;
      spectrumContext.beginPath();
      spectrumContext.moveTo(filterCutoffX, 0);
      spectrumContext.lineTo(filterCutoffX, curveHeight);
      spectrumContext.stroke();
      spectrumContext.setLineDash([]);
      drawFftCurve(data, width, curveHeight, `rgb(${r},${g},${b})`, 0.55, 1.5);
    }
    // master FFT (white / near-black)
    if (masterAnalyser) {
      const masterData  = masterAnalyser.getValue();
      const masterColor = state.isDark ? 'rgb(255,255,255)' : 'rgb(40,35,30)';
      drawFftCurve(masterData, width, curveHeight, masterColor, 0.75, 2);
    }
  }

  // static node frequency markers (always shown)
  for (const node of state.nodes) {
    if (node.muted) continue;
    const [r, g, b] = TYPES[node.type].rgb;
    const freq  = nodeFreq(node);
    const x     = freqToSpecX(freq, width);
    const alpha = state.isPlaying ? 0.8 : 0.4;
    const barH  = Math.round((curveHeight * 0.35) * (0.3 + node.volume * 0.7));

    const gradient = spectrumContext.createRadialGradient(x, curveHeight, 0, x, curveHeight, 18);
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.28})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    spectrumContext.fillStyle = gradient;
    spectrumContext.fillRect(x - 18, 0, 36, curveHeight);

    spectrumContext.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    spectrumContext.fillRect(x - 1.5, curveHeight - barH, 3, barH);
    spectrumContext.beginPath();
    spectrumContext.arc(x, curveHeight - barH, 3, 0, Math.PI * 2);
    spectrumContext.fillStyle = `rgba(${r},${g},${b},1)`;
    spectrumContext.fill();
  }

  // frequency labels
  spectrumContext.font         = '8px SF Mono,Fira Code,monospace';
  spectrumContext.textBaseline = 'top';
  SPEC_TICKS.forEach(hz => {
    if (!TICK_LABELS[hz]) return;
    const x = Math.round(freqToSpecX(hz, width));
    spectrumContext.fillStyle = textColor;
    spectrumContext.textAlign = hz < 2000 ? 'left' : 'center';
    spectrumContext.fillText(TICK_LABELS[hz], x + (hz < 100 ? 2 : 0), curveHeight + 2);
  });
}

export function resizeSpectrumCanvas() {
  const wrap = document.getElementById('spectrum-wrap');
  spectrumCanvas.width = wrap.clientWidth - 28;
}
