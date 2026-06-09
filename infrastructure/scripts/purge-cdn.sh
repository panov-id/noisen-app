#!/usr/bin/env bash
# Purge BunnyCDN pull zone cache without re-deploying files.
# Required: BUNNY_STORAGE_API_KEY, BUNNY_PULL_ZONE_ID
set -euo pipefail

: "${BUNNY_STORAGE_API_KEY:?Missing BUNNY_STORAGE_API_KEY}"
: "${BUNNY_PULL_ZONE_ID:?Missing BUNNY_PULL_ZONE_ID}"

echo "Purging pull zone ${BUNNY_PULL_ZONE_ID}..."
curl -sS -X POST \
  -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
  "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache"
echo
echo "Done."
