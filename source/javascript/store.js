// ── Shared reactive state ─────────────────────────────────────

export const APP_VERSION = '3.0';

export const TYPES = {
  sine:     { color:'#3a7bd5', rgb:[58,123,213]   },
  square:   { color:'#c47c20', rgb:[196,124,32]   },
  sawtooth: { color:'#9a2ab8', rgb:[154,42,184]   },
  triangle: { color:'#1fa0aa', rgb:[31,160,170]   },
  noise:    { color:'#1d9e5a', rgb:[29,158,90]    },
  // ── Drum types (Beat mode only) ──
  kick:     { color:'#e05530', rgb:[224,85,48]    },
  snare:    { color:'#d4a020', rgb:[212,160,32]   },
  hihat:    { color:'#30c8a0', rgb:[48,200,160]   },
  clap:     { color:'#b050d0', rgb:[176,80,208]   },
  perc:     { color:'#d06090', rgb:[208,96,144]   },
};

export const DRUM_TYPES = new Set(['kick', 'snare', 'hihat', 'clap', 'perc']);

export const TYPE_DEFAULTS = {
  sine:     { detune:0, vibratoRate:0, vibratoDepth:0 },
  square:   { detune:0, spread:0, voices:1 },
  sawtooth: { detune:0, spread:0, voices:1 },
  triangle: { detune:0, vibratoRate:0, vibratoDepth:0 },
  noise:    { color:'pink', resonance:1 },
  kick:     { tune:60, decay:0.35, pitchDecay:0.07 },
  snare:    { decay:0.18, tone:0.5 },
  hihat:    { tune:400, decay:0.06, open:0 },
  clap:     { decay:0.12, tone:0.5 },
  perc:     { tune:200, decay:0.25 },
};

export const DRUM_ICONS = {
  kick:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="12" rx="9" ry="9"/><ellipse cx="12" cy="12" rx="5" ry="5"/><line x1="12" y1="3" x2="12" y2="7"/></svg>`,
  snare: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="9" width="18" height="6" rx="2"/><line x1="3" y1="15" x2="6" y2="18"/><line x1="21" y1="15" x2="18" y2="18"/></svg>`,
  hihat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="8" rx="8" ry="3"/><ellipse cx="12" cy="11" rx="8" ry="3"/><line x1="12" y1="14" x2="12" y2="21"/></svg>`,
  clap:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 8 L12 4 L17 8"/><path d="M5 12 L12 6 L19 12"/><path d="M7 16 Q12 20 17 16"/></svg>`,
  perc:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="12" rx="8" ry="5"/><line x1="4" y1="12" x2="4" y2="18"/><line x1="20" y1="12" x2="20" y2="18"/><path d="M4 18 Q12 22 20 18"/></svg>`,
};

export const WAVE_ICONS = {
  sine:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 C4 4 6 4 8 12 C10 20 12 20 14 12 C16 4 18 4 20 12"/></svg>`,
  square:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 5,16 5,8 11,8 11,16 17,16 17,8 22,8"/></svg>`,
  sawtooth:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 8,8 8,16 14,8 14,16 20,8 20,16"/></svg>`,
  triangle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,16 8,6 14,16 20,6"/></svg>`,
  noise:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 L3.5 8 L5 15 L6.5 9 L8 13 L9.5 7 L11 14 L12 10 L13 13 L14.5 9 L16 15 L17.5 8 L19 12 L20.5 10 L22 12"/></svg>`,
};

export const ORBIT_TARGETS = [
  { id: 'filter', label: 'Filter' },
  { id: 'pan',    label: 'Pan'    },
  { id: 'volume', label: 'Vol'    },
  { id: 'delay',  label: 'Delay'  },
];

export const ORBIT_DEFAULTS = () => ({ target: 'filter', rate: 0.2, depth: 40, enabled: true });

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
  tune:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M2 12h4M18 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`,
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M2 8h20M2 16h20"/><circle cx="12" cy="8" r="2" fill="currentColor" stroke="none"/></svg>`,
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

  // beat mode
  beatMode: false,
  bpm: 120,
  beatStep: -1,

  // drag tracking
  draggingNodeId: null,

  // canvas dimensions
  panelHeight: 240,
};

export const WORLD_WIDTH  = 1920;
export const WORLD_HEIGHT = 1080; // fixed Y space for filterNorm — screen-size independent
export const TOP_H        = 68;
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
