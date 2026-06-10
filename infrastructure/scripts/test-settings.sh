#!/usr/bin/env bash
# Run UI settings-persistence tests inside Docker (playwright + chromium).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"

echo "Building test image..."
docker build -q \
  -f "${ROOT_DIR}/infrastructure/docker/Dockerfile.test" \
  -t noisen-test \
  "${ROOT_DIR}"

echo "Running tests..."
docker run --rm \
  -v "${ROOT_DIR}/infrastructure/tests:/tests" \
  -v "${ROOT_DIR}/concept.html:/app/concept.html" \
  noisen-test \
  python /tests/test-settings.py
