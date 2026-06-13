#!/usr/bin/env bash
# One-time setup: generate android/ and ios/ Capacitor native projects.
# Run this once after cloning; commit the generated directories to git.
# Requires: Docker
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../" && pwd)"

if [ -d "${ROOT_DIR}/android" ] && [ -d "${ROOT_DIR}/ios" ]; then
  echo "android/ and ios/ already exist. Remove them first if you want to regenerate."
  exit 0
fi

echo "Generating Capacitor native projects…"

docker run --rm \
  -v "${ROOT_DIR}:/application" \
  -w /application \
  node:20-alpine \
  sh -c "
    apk add --no-cache python3 make g++ &&
    npm install &&
    npx cap add android &&
    npx cap add ios &&
    echo 'Done.'
  "

echo ""
echo "Generated:"
echo "  android/  — Android project (commit to git)"
echo "  ios/      — iOS project (commit to git)"
echo ""
echo "Next steps:"
echo "  git add android/ ios/ && git commit -m 'Add Capacitor native projects'"
echo "  bash infrastructure/scripts/build-android.sh"
