#!/usr/bin/env bash
# Tests for session persistence, auto-rejoin, URL param, and link sharing features.
# Runs inside Docker (node:20-alpine) — no host dependencies.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

set -o allexport
source "$ROOT_DIR/.env.local"
set +o allexport

: "${VITE_SUPABASE_URL:?Missing VITE_SUPABASE_URL}"
: "${VITE_SUPABASE_ANON_KEY:?Missing VITE_SUPABASE_ANON_KEY}"

echo "=== Session features test ==="
echo "Supabase URL: $VITE_SUPABASE_URL"
echo ""

docker run --rm \
  -e VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  -e VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -v "$SCRIPT_DIR/test-session-features.js:/test.js:ro" \
  node:20-alpine \
  sh -c "mkdir /work && cd /work && npm install ws 2>&1 | tail -1 && cp /test.js /work/test.js && node /work/test.js"
