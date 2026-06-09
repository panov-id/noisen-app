#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

docker compose -f "$INFRA_DIR/docker-compose.yml" down 2>&1 | grep -v "^time="
