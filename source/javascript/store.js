// ── Shared reactive state ─────────────────────────────────────

export const APP_VERSION = '1.9';

export const TYPES = {
  sine:     { color:'#3a7bd5', rgb:[58,123,213]   },
  square:   { color:'#c47c20', rgb:[196,124,32]   },
  sawtooth: { color:'#9a2ab8', rgb:[154,42,184]   },
  triangle: { color:'#1fa0aa', rgb:[31,160,170]   },
  noise:    { color:'#1d9e5a', rgb:[29,158,90]    },
};

export const TYPE_DEFAULTS = {
  sine:     { detune:0, vibratoRate:0, vibratoDepth:0 },
  square:   { detune:0, spread:0, voices:1 },
  sawtooth: { detune:0, spread:0, voices:1 },
  triangle: { detune:0, vibratoRate:0, vibratoDepth:0 },
  noise:    { color:'pink', resonance:1 },
};

export const WAVE_ICONS = {
  sine:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 C4 4 6 4 8 12 C10 20 12 20 14 12 C16 4 18 4 20 12"/></svg>`,
  square:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 5,16 5,8 11,8 11,16 17,16 17,8 22,8"/></svg>`,
  sawtooth:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 8,8 8,16 14,8 14,16 20,8 20,16"/></svg>`,
  triangle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 8,6 14,16 20,6"/></svg>`,
  noise:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 L3.5 8 L5 15 L6.5 9 L8 13 L9.5 7 L11 14 L12 10 L13 13 L14.5 9 L16 15 L17.5 8 L19 12 L20.5 10 L22 12"/></svg>`,
};

export const PARAM_ICONS = {
  vol:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`,
  pan:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 12h8M4 8l4 4-4 4M20 8l-4 4 4 4"/></svg>`,
  det:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="4" fill="none"/></svg>`,
  vib:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 C4 8 6 8 8 12 C10 16 12 16 14 12 C16 8 18 8 20 12"/></svg>`,
  dep:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
  vcs:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  spr:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 12h8M5 8l-3 4 3 4M19 8l3 4-3 4"/></svg>`,
  res:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 L5 6 L8 18 L11 8 L14 16 L17 6 L20 18 L22 12"/></svg>`,
  noise:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 L3.5 8 L5 15 L6.5 9 L8 13 L9.5 7 L11 14 L12 10 L13 13 L14.5 9 L16 15 L17.5 8 L19 12 L20.5 10 L22 12"/></svg>`,
  rsnd:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18 C9 18 3 15 3 10 A9 9 0 0 1 21 10 C21 15 15 18 15 18"/><line x1="12" y1="18" x2="12" y2="22"/></svg>`,
  dsnd:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8 L8 8 M11 8 L16 8 M19 8 L21 8"/><path d="M3 16 L5 16 M8 16 L13 16 M16 16 L21 16"/></svg>`,
  fcut:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 18 Q6 18 8 12 Q10 6 14 6 Q18 6 22 6"/></svg>`,
  atk:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 20 L8 4 L14 14 L18 10 L22 10"/></svg>`,
  dcy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4 L8 4 L14 16 L18 14 L22 14"/></svg>`,
  sus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 L8 12 L8 6 L22 6"/></svg>`,
  rel:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6 L8 6 L14 18 L22 18"/></svg>`,
  ndly:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8 L7 8 M10 8 L14 8 M17 8 L19 8"/><path d="M5 16 L9 16 M12 16 L16 16 M19 16 L21 16"/><circle cx="20" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  nfdb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 C6 4 10 20 14 12 C16 8 18 10 22 12"/><path d="M18 8 L22 12 L18 16"/></svg>`,
  nwet:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3 L12 3 C12 3 5 11 5 15 A7 7 0 0 0 19 15 C19 11 12 3 12 3Z"/></svg>`,
};

// ── Mutable app state ─────────────────────────────────────────
export const state = {
  nodes: [],
  ripples: [],
  selectedNode: null,
  isPlaying: false,
  isDark: true,
  largeText: true,

  // viewport
  viewX: 0,
  viewY: 0,
  zoom: 1,
  velX: 0,
  velY: 0,

  // audio globals
  masterVolume: 0.7,
  gravityStrength: 0.5,
  masterTone: 0.6,
  waveSpread: 0.4,

  // node counter
  nodeSeq: 0,

  // canvas dimensions
  panelHeight: 240,
};

export const WORLD_WIDTH = 1920;
export const TOP_H       = 68;
export const NODE_MIN_R  = 13;
export const NODE_MAX_R  = 40;
export const ZOOM_MIN    = 0.25;
export const ZOOM_MAX    = 4;

// ── Settings persistence ──────────────────────────────────────
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem('noisen-settings') || '{}'); } catch { return {}; }
}

export function saveSettings(patch) {
  const current = loadSettings();
  localStorage.setItem('noisen-settings', JSON.stringify({ ...current, ...patch }));
}
