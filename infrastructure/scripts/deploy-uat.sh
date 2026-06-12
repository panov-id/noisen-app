#!/usr/bin/env bash
# Build and deploy to UAT (uat.noisen.space).
# Reads BUNNY_API_KEY from .env.local, fetches UAT storage credentials automatically.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

set -o allexport
source "$ROOT_DIR/.env.local"
set +o allexport

: "${BUNNY_API_KEY:?Missing BUNNY_API_KEY in .env.local}"

UAT_ZONE_ID=1587728
UAT_PULL_ZONE_ID=5997895

echo "Fetching UAT storage password…"
UAT_PASSWORD=$(curl -sS \
  -H "AccessKey: ${BUNNY_API_KEY}" \
  "https://api.bunny.net/storagezone/${UAT_ZONE_ID}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('Password',''))")

[ -n "$UAT_PASSWORD" ] || { echo "Error: could not fetch UAT storage password" >&2; exit 1; }

export BUNNY_STORAGE_ZONE=noisen-uat
export BUNNY_STORAGE_API_KEY="$UAT_PASSWORD"
export BUNNY_PULL_ZONE_ID="$UAT_PULL_ZONE_ID"

echo "Deploying to UAT…"
bash "$SCRIPT_DIR/deploy-cdn.sh"
