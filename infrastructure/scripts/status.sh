#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

docker compose -f "$INFRA_DIR/docker-compose.yml" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>&1 | grep -v "^time="
