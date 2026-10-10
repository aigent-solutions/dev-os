#!/usr/bin/env bash
# Runs scripts/sql/verify-rls.sql; exits 1 if any row comes back (00-foundation.md §4.2).
# DB_URL defaults to the local Supabase stack.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
rows="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f "$(dirname "$0")/sql/verify-rls.sql")"
if [[ -n "$rows" ]]; then
  echo "verify-rls: FAILED"; echo "$rows"; exit 1
fi
echo "verify-rls: ok"
