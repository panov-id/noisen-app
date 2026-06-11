#!/usr/bin/env bash
# Deploy pre-built dist/ to BunnyCDN — for use in CI (no Docker build step).
# Assumes dist/ is already built by the CI job before calling this script.
#
# Required env vars:
#   BUNNY_STORAGE_API_KEY  — Storage Zone password
#   BUNNY_STORAGE_ZONE     — Storage Zone name
#
# Optional env vars:
#   BUNNY_API_KEY          — Account API key (for cache purge)
#   BUNNY_PULL_ZONE_ID     — numeric Pull Zone ID (for cache purge)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

: "${BUNNY_STORAGE_API_KEY:?Missing BUNNY_STORAGE_API_KEY}"
: "${BUNNY_STORAGE_ZONE:?Missing BUNNY_STORAGE_ZONE}"

BASE_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}"
PURGE_KEY="${BUNNY_API_KEY:-${BUNNY_STORAGE_API_KEY}}"
BUILD=$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%s)

mime_type() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.mp3)  echo "audio/mpeg" ;;
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

echo "Build: ${BUILD}"
echo "Zone:  ${BUNNY_STORAGE_ZONE}"
echo

DIST_DIR="${ROOT_DIR}/dist"

TMP_SW=$(mktemp /tmp/sw-XXXXXX.js)
sed "s/__BUILD__/${BUILD}/g" "${DIST_DIR}/sw.js" > "${TMP_SW}"
echo "  → /sw.js (cache: noisen-${BUILD})"
curl -sS -X PUT \
  -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
  -H "Content-Type: application/javascript; charset=utf-8" \
  --data-binary "@${TMP_SW}" \
  "${BASE_URL}/sw.js" | cat
echo
rm "${TMP_SW}"

upload "${DIST_DIR}/index.html"    "index.html"
upload "${DIST_DIR}/manifest.json" "manifest.json"
upload "${ROOT_DIR}/silence.mp3"   "silence.mp3"

for file in "${DIST_DIR}/assets"/*; do
  [ -f "$file" ] || continue
  upload "$file" "assets/$(basename "$file")"
done

upload "${ROOT_DIR}/icons/icon.svg"          "icons/icon.svg"
upload "${ROOT_DIR}/icons/icon-maskable.svg" "icons/icon-maskable.svg"
for size in 192 512; do
  for variant in "" "-maskable"; do
    file="${ROOT_DIR}/icons/icon${variant}-${size}.png"
    [ -f "$file" ] && upload "$file" "icons/icon${variant}-${size}.png"
  done
done

for file in "${ROOT_DIR}/marketing"/*.svg "${ROOT_DIR}/marketing"/*.png; do
  [ -f "$file" ] || continue
  upload "$file" "marketing/$(basename "$file")"
done

if [ -n "${BUNNY_PULL_ZONE_ID:-}" ]; then
  echo "Purging pull zone ${BUNNY_PULL_ZONE_ID}..."
  curl -sS -X POST \
    -H "AccessKey: ${PURGE_KEY}" \
    "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache"
  echo
  echo "  Cache purged."
else
  echo "  (no BUNNY_PULL_ZONE_ID — skipping cache purge)"
fi

echo
echo "Deploy complete (build: ${BUILD})"
