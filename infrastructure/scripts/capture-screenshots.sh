#!/usr/bin/env bash
# Capture UX screenshots using Playwright inside Docker.
# Output: infrastructure/screenshots/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

docker build -q \
  -f "${ROOT_DIR}/infrastructure/docker/Dockerfile.test" \
  -t noisen-test \
  "${ROOT_DIR}"

docker run --rm \
  -v "${ROOT_DIR}/infrastructure/tests:/tests" \
  -v "${ROOT_DIR}/source:/app" \
  -v "${ROOT_DIR}/infrastructure/screenshots:/screenshots" \
  noisen-test \
  python /tests/capture-screenshots.py

echo "Screenshots saved to infrastructure/screenshots/"
