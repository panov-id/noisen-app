#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

docker exec supabase-db psql -U postgres -d postgres -c "\dt public.*"
