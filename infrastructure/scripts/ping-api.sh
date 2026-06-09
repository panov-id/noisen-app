#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

curl -s http://localhost:8000/rest/v1/ \
  -H "apikey: $ANON_KEY" \
  | python3 -m json.tool
