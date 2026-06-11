#!/usr/bin/env bash
# Run responsiveness and layout tests via Playwright in Docker.
# Tests: portrait/landscape layout, card label visibility, resize stability.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

docker run --rm \
  -v "${ROOT_DIR}/infrastructure/tests:/tests" \
  -v "${ROOT_DIR}/dist:/dist" \
  noisen-test \
  python3 /tests/test-responsiveness.py

echo "Responsiveness tests done."
