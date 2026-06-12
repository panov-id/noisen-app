#!/usr/bin/env bash
# Convert all press SVGs to JPG using Puppeteer in Docker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRESS_DIR="$ROOT_DIR/press/v5.0"

cat > /tmp/svg2jpg.js << 'JSEOF'
const puppeteer = require('puppeteer');
const fs   = require('fs');
const path = require('path');

const dirs    = process.argv.slice(2);
const quality = 92;

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });

  for (const dir of dirs) {
    const svgs = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
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
      await page.screenshot({ path: jpgPath, type: 'jpeg', quality, clip: { x:0, y:0, width, height } });
      await page.close();
      console.log('  ✓', path.relative('/images-root', dir) + '/' + file.replace('.svg','.jpg'), `(${width}×${height})`);
    }
  }

  await browser.close();
  console.log('\nDone.');
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
JSEOF

cp /tmp/svg2jpg.js /tmp/svg2jpg-press.js

chmod -R o+w "$PRESS_DIR"

docker run --rm \
  -v "$PRESS_DIR:/images-root" \
  -v "/tmp/svg2jpg-press.js:/home/pptruser/svg2jpg.js:ro" \
  --shm-size=512m \
  ghcr.io/puppeteer/puppeteer:21.5.2 \
  sh -c "node /home/pptruser/svg2jpg.js /images-root /images-root/instagram"

chmod -R o-w "$PRESS_DIR"
