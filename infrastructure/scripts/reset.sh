#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

echo "Stopping containers and removing volumes..."
docker compose -f "$INFRA_DIR/docker-compose.yml" down -v 2>&1 | grep -v "^time="
echo "Done. Run setup.sh to start fresh."
