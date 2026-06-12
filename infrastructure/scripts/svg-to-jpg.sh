#!/usr/bin/env bash
# Convert SVG files to JPG using Chromium headless inside Docker.
# Usage: ./svg-to-jpg.sh <input-dir> [quality]
set -euo pipefail

INPUT_DIR="${1:?Usage: $0 <svg-dir> [quality]}"
QUALITY="${2:-92}"
ABS_DIR="$(cd "$INPUT_DIR" && pwd)"

echo "=== SVG → JPG conversion ==="
echo "Directory: $ABS_DIR"
echo "Quality:   $QUALITY"
echo ""

# Node script that uses Puppeteer to render each SVG to JPG
cat > /tmp/svg2jpg.js << 'JSEOF'
const puppeteer = require('puppeteer');
const fs   = require('fs');
const path = require('path');

const dir     = process.argv[2];
const quality = parseInt(process.argv[3] ?? '92');

const svgs = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
if (!svgs.length) { console.log('No SVG files found.'); process.exit(0); }

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });

  for (const file of svgs) {
    const svgPath = path.join(dir, file);
    const jpgPath = path.join(dir, file.replace(/\.svg$/, '.jpg'));

    const svg    = fs.readFileSync(svgPath, 'utf8');
    const wMatch = svg.match(/width="(\d+)"/);
    const hMatch = svg.match(/height="(\d+)"/);
    const width  = wMatch ? parseInt(wMatch[1]) : 1200;
    const height = hMatch ? parseInt(hMatch[1]) : 675;

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    await page.goto(dataUrl, { waitUntil: 'networkidle0' });

    await page.screenshot({
      path: jpgPath,
      type: 'jpeg',
      quality,
      clip: { x: 0, y: 0, width, height },
    });

    await page.close();
    console.log('  ✓', file, '→', path.basename(jpgPath), `(${width}×${height})`);
  }

  await browser.close();
  console.log('\nDone.');
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
JSEOF

docker run --rm \
  -v "$ABS_DIR:/images" \
  -v "/tmp/svg2jpg.js:/svg2jpg.js:ro" \
  --shm-size=512m \
  ghcr.io/puppeteer/puppeteer:21.5.2 \
  sh -c "cd /home/pptruser && npm install puppeteer 2>&1 | tail -2 && node /svg2jpg.js /images $QUALITY"
