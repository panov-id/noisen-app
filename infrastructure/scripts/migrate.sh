#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"

MIGRATIONS_DIR="$INFRA_DIR/migrations"

for file in "$MIGRATIONS_DIR"/*.sql; do
  echo "Applying: $(basename "$file")"
  docker exec -i supabase-db psql \
    -U postgres \
    -d postgres \
    -f - < "$file"
  echo "Done: $(basename "$file")"
done

echo "All migrations applied."
