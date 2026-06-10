#!/usr/bin/env bash
# Patch all orbit objects in main.js to include random direction via rndDir().
# Runs inside the noisen-build Docker image (Node 20 Alpine).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

docker run --rm \
  -v "${ROOT_DIR}/source/javascript:/source" \
  node:20-alpine \
  node -e "
const fs = require('fs');
const path = '/source/main.js';
let content = fs.readFileSync(path, 'utf8');

// Insert direction: rndDir() before enabled: true in orbit objects
// Matches: { target: '...', rate: ..., depth: ..., enabled: true }
const before = (content.match(/enabled: true/g) || []).length;
// Add direction: rndDir() before enabled: true in orbit objects that don't already have it
content = content.replace(/, enabled: true \}/g, ', direction: rndDir(), enabled: true }');
const after = (content.match(/direction: rndDir\(\)/g) || []).length;
console.log('Patched ' + after + ' orbit objects (was ' + before + ' total)');

fs.writeFileSync(path, content);
"

echo "Done."
