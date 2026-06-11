#!/usr/bin/env bash
# Check recent GitHub Actions runs and show logs for failed jobs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GITHUB_TOKEN="${GITHUB_TOKEN:?Missing GITHUB_TOKEN}"
GITHUB_REPO="${GITHUB_REPO:-panov-id/noisen-app}"

docker run --rm \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -e GITHUB_REPO="${GITHUB_REPO}" \
  -v "${SCRIPT_DIR}/../setup:/setup" \
  python:3.12-alpine \
  sh -c "pip install -q requests && python3 /setup/check-ci.py"
