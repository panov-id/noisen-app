// ── Analytics + error tracking ────────────────────────────────
// Page views and custom events go to Plausible (if VITE_PLAUSIBLE_URL is set).
// JS errors go to Plausible custom events AND Supabase events table.

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PLAUSIBLE_URL  = import.meta.env.VITE_PLAUSIBLE_URL;

// inject Plausible script dynamically so the URL is configurable per environment
if (PLAUSIBLE_URL) {
  const script = document.createElement('script');
  script.defer = true;
  script.setAttribute('data-domain', 'noisen.space');
  script.src = PLAUSIBLE_URL + '/js/script.custom-events.js';
  document.head.appendChild(script);
}

function plausibleEvent(name, props) {
  if (typeof window.plausible === 'function') {
    window.plausible(name, { props });
  }
}

function supabaseEvent(type, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  navigator.sendBeacon?.(
    `${SUPABASE_URL}/rest/v1/events`,
    new Blob([JSON.stringify({ type, payload })], { type: 'application/json' }),
  );
}

// ── Session duration ──────────────────────────────────────────
const sessionStart = Date.now();

function reportSessionEnd() {
  const seconds = Math.round((Date.now() - sessionStart) / 1000);
  plausibleEvent('Session end', { duration_seconds: seconds });
}

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') reportSessionEnd();
});
window.addEventListener('pagehide', reportSessionEnd);

// ── Error tracking ────────────────────────────────────────────
function captureError(message, source, line, col) {
  const props = { message: String(message).slice(0, 300), source: String(source ?? '').slice(0, 200), line: line ?? 0 };
  plausibleEvent('JS error', props);
  supabaseEvent('js_error', { ...props, col, userAgent: navigator.userAgent });
}

window.addEventListener('error', e => {
  captureError(e.message, e.filename, e.lineno, e.colno);
});

window.addEventListener('unhandledrejection', e => {
  const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
  captureError(`Unhandled promise: ${message}`, '', 0, 0);
});

// ── Public API ────────────────────────────────────────────────
export function trackPresetGenerated(archetype, nodeCount) {
  plausibleEvent('Preset generated', { archetype, node_count: nodeCount });
}

export function trackShortLinkCreated() {
  plausibleEvent('Short link created');
}

export function trackNodeCreated(type) {
  plausibleEvent('Node created', { type });
}

export function trackPlayToggled(isPlaying) {
  plausibleEvent(isPlaying ? 'Play started' : 'Play stopped');
}
