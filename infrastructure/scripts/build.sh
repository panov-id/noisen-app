#!/usr/bin/env bash
# Build source/ → dist/ using Docker + Vite.
# Output lands in dist/ at the project root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

echo "Building Noisen…"

docker build \
  -f "${ROOT_DIR}/infrastructure/docker/Dockerfile.build" \
  -t noisen-build \
  "${ROOT_DIR}"

# Extract dist/ from the built image to the host
docker run --rm \
  -v "${ROOT_DIR}/dist:/output" \
  noisen-build \
  sh -c "cp -r /application/dist/. /output/"

echo "Build complete → dist/"
