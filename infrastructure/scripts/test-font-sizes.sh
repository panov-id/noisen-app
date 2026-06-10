#!/usr/bin/env bash
# Test that font sizes scale correctly with large-text mode.
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
  noisen-test \
  python /tests/test-font-sizes.py
