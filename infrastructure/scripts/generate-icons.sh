#!/usr/bin/env bash
# Convert SVG icons and marketing images to PNG using rsvg-convert in Docker.
# No host dependencies required — only Docker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
DOCKERFILE="$SCRIPT_DIR/../docker/Dockerfile.icons"
IMAGE="noisen-icons"

echo "Building icon converter image..."
docker build -q -t "$IMAGE" -f "$DOCKERFILE" "$SCRIPT_DIR/../docker"
echo "  Image ready."
echo

convert_png() {
  local source="$1"
  local destination="$2"
  local width="$3"
  local height="$4"
  echo "  → ${destination} (${width}×${height})"
  docker run --rm \
    -v "${ROOT_DIR}:/work" \
    "$IMAGE" \
    -w "$width" -h "$height" \
    "/work/${source}" \
    -o "/work/${destination}"
}

echo "Icons..."
convert_png "icons/icon.svg"          "icons/icon-192.png"          192  192
convert_png "icons/icon.svg"          "icons/icon-512.png"          512  512
convert_png "icons/icon-maskable.svg" "icons/icon-maskable-192.png" 192  192
convert_png "icons/icon-maskable.svg" "icons/icon-maskable-512.png" 512  512

echo
echo "Marketing images..."
convert_png "marketing/og.svg"            "marketing/og.png"            1200 630
convert_png "marketing/social-banner.svg" "marketing/social-banner.png" 1280 640

echo
echo "Generated:"
ls -lh \
  "${ROOT_DIR}/icons/icon-192.png" \
  "${ROOT_DIR}/icons/icon-512.png" \
  "${ROOT_DIR}/icons/icon-maskable-192.png" \
  "${ROOT_DIR}/icons/icon-maskable-512.png" \
  "${ROOT_DIR}/marketing/og.png" \
  "${ROOT_DIR}/marketing/social-banner.png" \
  2>/dev/null
