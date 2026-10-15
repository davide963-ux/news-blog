#!/usr/bin/env bash
# Runs the end-to-end pipeline test against a scratch PostgreSQL database.
# Usage: E2E_ADMIN_URL=postgresql://user:pass@localhost:5432/postgres ./scripts/e2e.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL="${E2E_ADMIN_URL:-postgresql://newsblog:newsblog@localhost:5432/postgres}"
TEST_DB="newsblog_e2e"
BASE="${ADMIN_URL%/*}"
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $TEST_DB" -c "CREATE DATABASE $TEST_DB"
export DATABASE_URL="$BASE/$TEST_DB" DIRECT_URL="$BASE/$TEST_DB"
npx prisma migrate deploy >/dev/null
npx tsx scripts/e2e-pipeline.ts
