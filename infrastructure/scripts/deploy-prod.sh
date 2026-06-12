#!/usr/bin/env bash
# Build and deploy to production (noisen.space).
# Reads BUNNY_API_KEY from .env.local, fetches prod storage credentials automatically.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

set -o allexport
source "$ROOT_DIR/.env.local"
set +o allexport

: "${BUNNY_STORAGE_API_KEY:?Missing BUNNY_STORAGE_API_KEY in .env.local}"
: "${BUNNY_STORAGE_ZONE:?Missing BUNNY_STORAGE_ZONE in .env.local}"
: "${BUNNY_PULL_ZONE_ID:?Missing BUNNY_PULL_ZONE_ID in .env.local}"

echo "Deploying to PROD (${BUNNY_STORAGE_ZONE})…"
bash "$SCRIPT_DIR/deploy-cdn.sh"
