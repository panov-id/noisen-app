#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

generate_jwt() {
  local payload="$1"
  local secret="$2"
  local header
  local body
  local signature
  header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  body=$(echo -n "$payload" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  signature=$(echo -n "${header}.${body}" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  echo "${header}.${body}.${signature}"
}

rand32() { openssl rand -base64 32 | tr -d '=+/' | cut -c1-32; }
rand48() { openssl rand -base64 48 | tr -d '=+/' | cut -c1-48; }
rand64() { openssl rand -hex 32; }

if [ -f "$ENV_FILE" ]; then
  echo ".env already exists, skipping generation"
else
  echo "Generating .env..."

  postgres_password=$(rand32)
  jwt_secret=$(rand48)
  secret_key_base=$(rand64)
  vault_enc_key=$(rand32)
  pg_meta_crypto_key=$(rand32)
  s3_access_key_id=$(openssl rand -hex 16)
  s3_access_key_secret=$(openssl rand -hex 32)

  anon_key=$(generate_jwt '{"role":"anon","iss":"supabase-local","iat":1641769200,"exp":1799535600}' "$jwt_secret")
  service_role_key=$(generate_jwt '{"role":"service_role","iss":"supabase-local","iat":1641769200,"exp":1799535600}' "$jwt_secret")

  cat > "$ENV_FILE" <<EOF
# Secrets
POSTGRES_PASSWORD=$postgres_password
JWT_SECRET=$jwt_secret
ANON_KEY=$anon_key
SERVICE_ROLE_KEY=$service_role_key
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
JWT_KEYS=
JWT_JWKS=

# Dashboard access
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=$(rand32)

# Encryption keys
SECRET_KEY_BASE=$secret_key_base
VAULT_ENC_KEY=$vault_enc_key
PG_META_CRYPTO_KEY=$pg_meta_crypto_key

# Storage S3
S3_PROTOCOL_ACCESS_KEY_ID=$s3_access_key_id
S3_PROTOCOL_ACCESS_KEY_SECRET=$s3_access_key_secret

# URLs
SUPABASE_PUBLIC_URL=http://localhost:8000
API_EXTERNAL_URL=http://localhost:8000
SITE_URL=http://localhost:5173
ADDITIONAL_REDIRECT_URLS=

# Database
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# Kong ports
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# Pooler
POOLER_PROXY_PORT_TRANSACTION=6543
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_TENANT_ID=noisen-local
POOLER_DB_POOL_SIZE=5

# Studio
STUDIO_DEFAULT_ORGANIZATION=Noisen
STUDIO_DEFAULT_PROJECT=noisen-app
OPENAI_API_KEY=

# Auth
JWT_EXPIRY=3600
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
ENABLE_ANONYMOUS_USERS=true
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false

# Mailer
SMTP_ADMIN_EMAIL=admin@localhost
SMTP_HOST=supabase-mail
SMTP_PORT=2500
SMTP_USER=fake_mail_user
SMTP_PASS=fake_mail_password
SMTP_SENDER_NAME=Noisen
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# Storage
STORAGE_TENANT_ID=stub
REGION=local
GLOBAL_S3_BUCKET=stub
IMGPROXY_AUTO_WEBP=true

# PostgREST
PGRST_DB_SCHEMAS=public,storage,graphql_public
PGRST_DB_EXTRA_SEARCH_PATH=public
PGRST_DB_MAX_ROWS=1000

# Edge Functions
FUNCTIONS_VERIFY_JWT=false
EOF

  echo ".env generated"
fi

echo "Starting containers..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d 2>&1 | grep -v "^time="

echo ""
echo "Services:"
echo "  Studio:  http://localhost:8080"
echo "  API:     http://localhost:8000"
echo ""
echo "Check status:  ./scripts/status.sh"
echo "Check API:     ./scripts/ping-api.sh"
echo "View logs:     ./scripts/logs.sh <service>"
