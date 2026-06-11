#!/usr/bin/env bash
# One-time setup: create BunnyCDN UAT zone + set all GitHub Actions secrets.
#
# Usage: bash infrastructure/scripts/setup-environments.sh
#
# Required env vars (pass via .env.local or inline):
#   BUNNY_API_KEY      — BunnyCDN Account API key
#   BUNNY_STORAGE_API_KEY — production storage zone password
#   BUNNY_STORAGE_ZONE    — production storage zone name
#   BUNNY_PULL_ZONE_ID    — production pull zone ID
#   GITHUB_TOKEN       — fine-grained token with Secrets + Environments write access
#   GITHUB_REPO        — owner/repo, e.g. panov-id/noisen-app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

# Load .env.local if present
if [ -f "${ROOT_DIR}/.env.local" ]; then
  export $(grep -v '^#' "${ROOT_DIR}/.env.local" | xargs)
fi

: "${BUNNY_API_KEY:?}"
: "${BUNNY_STORAGE_API_KEY:?}"
: "${BUNNY_STORAGE_ZONE:?}"
: "${BUNNY_PULL_ZONE_ID:?}"
: "${GITHUB_TOKEN:?}"
: "${GITHUB_REPO:=${GITHUB_REPO:-panov-id/noisen-app}}"

echo "═══════════════════════════════════════════════"
echo " Noisen environment setup"
echo " Repo: ${GITHUB_REPO}"
echo "═══════════════════════════════════════════════"
echo

docker run --rm \
  -e BUNNY_API_KEY="${BUNNY_API_KEY}" \
  -e BUNNY_STORAGE_API_KEY="${BUNNY_STORAGE_API_KEY}" \
  -e BUNNY_STORAGE_ZONE="${BUNNY_STORAGE_ZONE}" \
  -e BUNNY_PULL_ZONE_ID="${BUNNY_PULL_ZONE_ID}" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -e GITHUB_REPO="${GITHUB_REPO}" \
  python:3.12-alpine \
  sh -c "pip install -q PyNaCl requests && python3 /setup/setup.py" \
  -v "${SCRIPT_DIR}/../setup:/setup" 2>/dev/null || \
docker run --rm \
  -e BUNNY_API_KEY="${BUNNY_API_KEY}" \
  -e BUNNY_STORAGE_API_KEY="${BUNNY_STORAGE_API_KEY}" \
  -e BUNNY_STORAGE_ZONE="${BUNNY_STORAGE_ZONE}" \
  -e BUNNY_PULL_ZONE_ID="${BUNNY_PULL_ZONE_ID}" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -e GITHUB_REPO="${GITHUB_REPO}" \
  -v "${SCRIPT_DIR}/../setup:/setup" \
  python:3.12-alpine \
  sh -c "pip install -q PyNaCl requests && python3 /setup/setup.py"
