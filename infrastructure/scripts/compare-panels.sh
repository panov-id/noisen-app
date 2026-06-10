#!/usr/bin/env bash
# Screenshot synth node panel vs drum node panel for visual comparison.
# Output: infrastructure/screenshots/panel-synth.png, panel-drum.png
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"
SHOTS_DIR="${ROOT_DIR}/infrastructure/screenshots"
mkdir -p "${SHOTS_DIR}"

docker run --rm \
  -v "${ROOT_DIR}/infrastructure/tests:/tests" \
  -v "${ROOT_DIR}/dist:/dist" \
  -v "${SHOTS_DIR}:/screenshots" \
  noisen-test \
  python3 /tests/compare-panels.py

echo "Screenshots saved to infrastructure/screenshots/"
