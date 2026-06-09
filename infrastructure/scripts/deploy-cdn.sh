#!/usr/bin/env bash
# Deploy static files to BunnyCDN Storage Zone.
# Required env vars: BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE
# Optional env vars: BUNNY_STORAGE_REGION (default: de), BUNNY_PULL_ZONE_ID (for cache purge)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"

: "${BUNNY_STORAGE_API_KEY:?Missing BUNNY_STORAGE_API_KEY}"
: "${BUNNY_STORAGE_ZONE:?Missing BUNNY_STORAGE_ZONE}"
BASE_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}"

mime_type() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.ico)  echo "image/x-icon" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

upload() {
  local local_path="$1"
  local remote_path="$2"
  local content_type
  content_type="$(mime_type "$local_path")"
  echo "  → /${remote_path}"
  curl -sS -X PUT \
    -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
    -H "Content-Type: ${content_type}" \
    --data-binary "@${local_path}" \
    "${BASE_URL}/${remote_path}" | cat
  echo
}

echo "Deploying Noisen → https://noisen.space"
echo

upload "${ROOT_DIR}/concept.html"                     "index.html"
upload "${ROOT_DIR}/manifest.json"                    "manifest.json"
upload "${ROOT_DIR}/sw.js"                            "sw.js"

# icons — SVG + PNG variants
upload "${ROOT_DIR}/icons/icon.svg"                   "icons/icon.svg"
upload "${ROOT_DIR}/icons/icon-maskable.svg"          "icons/icon-maskable.svg"
for size in 192 512; do
  for variant in "" "-maskable"; do
    file="${ROOT_DIR}/icons/icon${variant}-${size}.png"
    [ -f "$file" ] && upload "$file" "icons/icon${variant}-${size}.png"
  done
done

# marketing assets
for file in "${ROOT_DIR}/marketing"/*.svg "${ROOT_DIR}/marketing"/*.png; do
  [ -f "$file" ] || continue
  upload "$file" "marketing/$(basename "$file")"
done

# purge pull zone cache
if [ -n "${BUNNY_PULL_ZONE_ID:-}" ]; then
  echo "Purging pull zone cache..."
  curl -sS -X POST \
    -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
    "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache"
  echo
  echo "Cache purged."
fi

echo "Deploy complete → https://noisen.space"
