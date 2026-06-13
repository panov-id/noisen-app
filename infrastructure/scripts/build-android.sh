#!/usr/bin/env bash
# Build Android APK via Docker.
# Output: android/app/build/outputs/apk/debug/app-debug.apk
#
# Prerequisites:
#   - android/ directory must exist (run setup-capacitor.sh once)
#   - Env vars for Vite build (VITE_SUPABASE_URL etc.) can be set or left empty
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

if [ ! -d "${ROOT_DIR}/android" ]; then
  echo "Error: android/ not found. Run: bash infrastructure/scripts/setup-capacitor.sh" >&2
  exit 1
fi

if [ -f "${ROOT_DIR}/.env.local" ]; then
  export $(grep -v '^#' "${ROOT_DIR}/.env.local" | xargs) 2>/dev/null || true
fi

echo "Building Android APK…"

docker build \
  -f "${ROOT_DIR}/infrastructure/docker/Dockerfile.android" \
  -t noisen-android \
  --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}" \
  --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}" \
  --build-arg VITE_PLAUSIBLE_URL="${VITE_PLAUSIBLE_URL:-}" \
  "${ROOT_DIR}"

OUTPUT_DIR="${ROOT_DIR}/android/app/build/outputs/apk/debug"
mkdir -p "${OUTPUT_DIR}"

docker run --rm \
  -v "${OUTPUT_DIR}:/output" \
  noisen-android \
  sh -c "cp /application/android/app/build/outputs/apk/debug/app-debug.apk /output/"

echo ""
echo "APK → android/app/build/outputs/apk/debug/app-debug.apk"
