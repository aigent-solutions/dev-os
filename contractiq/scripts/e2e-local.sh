#!/usr/bin/env bash
# Runs a command (Playwright, the demo recorder, …) against a fully local ContractIQ:
#   - Supabase: the local stack (`npm run db:start`), never a hosted project
#   - OpenAI: tests/mocks/openai-mock-server.ts on :4010 (no API spend)
#   - App: `next dev` on :3100 with PROCESSING_MODE=sync (no Netlify background runtime)
# Env set here overrides .env.local (Next.js never overwrites existing variables).
# Usage: bash scripts/e2e-local.sh <command…>     SUPABASE_WORKDIR=<dir> to point at another supabase/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-3100}"
STATUS_ARGS=()
[[ -n "${SUPABASE_WORKDIR:-}" ]] && STATUS_ARGS=(--workdir "$SUPABASE_WORKDIR")
STACK_ENV="$(supabase status -o env "${STATUS_ARGS[@]}" 2>/dev/null)" || { echo "Local Supabase is not running. Start it with: npm run db:start" >&2; exit 1; }
eval "$(echo "$STACK_ENV" | sed 's/^/export /')"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing to run: Supabase API_URL '$API_URL' is not local." >&2; exit 1 ;;
esac

export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_APP_URL="http://localhost:$PORT" PLAYWRIGHT_BASE_URL="http://localhost:$PORT"
export OPENAI_BASE_URL="http://localhost:4010/v1" OPENAI_API_KEY="sk-local-mock-not-a-real-key"
export OPENAI_PRICE_INPUT_PER_MTOK="${OPENAI_PRICE_INPUT_PER_MTOK:-2.5}" OPENAI_PRICE_OUTPUT_PER_MTOK="${OPENAI_PRICE_OUTPUT_PER_MTOK:-10}"
export PROCESSING_MODE=sync NEXT_PUBLIC_SHOW_CALIBRATION_WARNING=false NEXT_TELEMETRY_DISABLED=1
# Fixed, non-secret test values (as in CI), so a local run never depends on .env.local for these.
export OPENAI_USER_HASH_SALT="local-e2e-salt-local-e2e-salt-local-e2e" OPENAI_MONTHLY_BUDGET_USD=400
export INTERNAL_FUNCTION_SECRET="local-e2e-internal-secret-local-e2e-0000"

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; lsof -ti:"$PORT" -sTCP:LISTEN | xargs -r kill 2>/dev/null || true; lsof -ti:4010 -sTCP:LISTEN | xargs -r kill 2>/dev/null || true; }
trap cleanup EXIT

if lsof -ti:"$PORT" -sTCP:LISTEN >/dev/null || lsof -ti:4010 -sTCP:LISTEN >/dev/null; then
  echo "Port $PORT or 4010 is already in use; stop that process first." >&2; exit 1
fi

npx tsx tests/mocks/openai-mock-server.ts >/tmp/ciq-openai-mock.log 2>&1 & PIDS+=($!)
npx next dev -p "$PORT" >/tmp/ciq-e2e-app.log 2>&1 & PIDS+=($!)

for _ in $(seq 1 120); do
  curl -sf "http://localhost:$PORT/api/health" >/dev/null && curl -sf -o /dev/null -X POST "http://localhost:4010/v1/chat/completions" -d '{"response_format":{}}' && break
  sleep 1
done
curl -sf "http://localhost:$PORT/api/health" >/dev/null || { echo "App did not become healthy; see /tmp/ciq-e2e-app.log" >&2; exit 1; }

"$@"
