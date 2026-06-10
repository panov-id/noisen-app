#!/usr/bin/env bash
# Take UI screenshots inside Docker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
SHOTS_DIR="${ROOT_DIR}/infrastructure/screenshots"
mkdir -p "${SHOTS_DIR}"

docker build -q \
  -f "${ROOT_DIR}/infrastructure/docker/Dockerfile.test" \
  -t noisen-test \
  "${ROOT_DIR}"

docker run --rm \
  -v "${ROOT_DIR}/infrastructure/tests:/tests" \
  -v "${ROOT_DIR}/concept.html:/app/concept.html" \
  -v "${SHOTS_DIR}:/screenshots" \
  noisen-test \
  python /tests/screenshot.py

echo "Screenshots saved to infrastructure/screenshots/"
