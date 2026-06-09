#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

SERVICE="${1:-}"
if [ -z "$SERVICE" ]; then
  echo "Usage: logs.sh <service>"
  echo "Services: db, auth, rest, kong, studio, storage, meta, realtime, pooler, edge-functions, imgproxy"
  exit 1
fi

docker compose -f "$INFRA_DIR/docker-compose.yml" logs "$SERVICE" --tail=50 --follow 2>&1 | grep -v "^time="
