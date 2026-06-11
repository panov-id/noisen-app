// ── Short links + QR codes ────────────────────────────────────
// Short links are stored in Supabase (short_links table).
// The short URL format is: https://noisen.space?s=CODE
// Configure via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

import QRCode from 'qrcode';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
function generateCode(length = 6) {
  return Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
}

export async function createShortLink(longUrl) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)');

  // retry up to 3 times in case of code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/short_links`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ code, url: longUrl }),
    });
    if (response.ok) {
      const shortUrl = `${window.location.origin}${window.location.pathname}?s=${code}`;
      return { shortUrl, code };
    }
    if (response.status !== 409) {
      const text = await response.text();
      throw new Error(`Supabase error ${response.status}: ${text}`);
    }
  }
  throw new Error('Failed to create short link after 3 attempts');
}

export async function resolveShortCode(code) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/short_links?code=eq.${encodeURIComponent(code)}&select=url`,
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return null;
    const rows = await response.json();
    const url = rows[0]?.url ?? null;
    if (url) {
      // increment hit counter in the background
      fetch(`${SUPABASE_URL}/rest/v1/short_links?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ hits: rows[0].hits + 1 }),
      }).catch(() => {});
    }
    return url;
  } catch {
    return null;
  }
}

export async function generateQRDataURL(url, { size = 200, dark = '#ffffff', light = '#00000000' } = {}) {
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: { dark, light },
    errorCorrectionLevel: 'M',
  });
}

// Show the share/QR modal with a short link
export async function showShareModal(longUrl) {
  let modal = document.getElementById('share-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.innerHTML = `
      <div id="share-sheet">
        <div id="share-header">
          <span id="share-title">SHARE</span>
          <button id="share-close">✕</button>
        </div>
        <div id="share-qr-wrap"><canvas id="share-qr"></canvas></div>
        <div id="share-url-row">
          <input id="share-url-input" type="text" readonly>
          <button id="share-copy-btn">Copy</button>
        </div>
        <div id="share-status"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#share-close').addEventListener('click', () => {
      modal.classList.remove('open');
    });
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('open');
    });
    modal.querySelector('#share-copy-btn').addEventListener('click', () => {
      const input = modal.querySelector('#share-url-input');
      navigator.clipboard.writeText(input.value).then(() => {
        const status = modal.querySelector('#share-status');
        status.textContent = 'Copied ✓';
        setTimeout(() => { status.textContent = ''; }, 2000);
      });
    });
  }

  const input    = modal.querySelector('#share-url-input');
  const status   = modal.querySelector('#share-status');
  const qrCanvas = modal.querySelector('#share-qr');

  input.value = '';
  status.textContent = 'Creating short link…';
  modal.classList.add('open');

  try {
    const { shortUrl } = await createShortLink(longUrl);
    input.value = shortUrl;
    status.textContent = '';

    await QRCode.toCanvas(qrCanvas, shortUrl, {
      width: 200, margin: 1,
      color: { dark: '#e8e8f0', light: '#00000000' },
      errorCorrectionLevel: 'M',
    });
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    input.value = longUrl;
    await QRCode.toCanvas(qrCanvas, longUrl, {
      width: 200, margin: 1,
      color: { dark: '#e8e8f0', light: '#00000000' },
      errorCorrectionLevel: 'M',
    });
  }
}
