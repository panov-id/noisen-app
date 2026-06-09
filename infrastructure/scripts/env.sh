#!/usr/bin/env bash
# Shared: load .env and set SCRIPT_DIR / INFRA_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$INFRA_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found. Run setup.sh first." >&2
  exit 1
fi

set -o allexport
source "$ENV_FILE"
set +o allexport
