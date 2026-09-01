#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
failed=0

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf 'OK   %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label"
    failed=1
  fi
}

check "Bun executable" command -v bun
check "Environment file" test -f .env
check "Views directory" test -d views
check "Public assets" test -d public
check "Data directory writable" test -w data

if [[ -f .env ]]; then
  if grep -q '^APP_SECRET=replace-with-at-least-32-random-characters$' .env; then
    echo "FAIL APP_SECRET still uses the example placeholder"
    failed=1
  else
    echo "OK   APP_SECRET changed from placeholder"
  fi

  env_name="$(grep -E '^NODE_ENV=' .env | tail -1 | cut -d= -f2- || true)"
  server_port="$(grep -E '^SERVER_PORT=' .env | tail -1 | cut -d= -f2- || true)"
  [[ -n "$server_port" ]] && echo "OK   Server port configured: $server_port"

  if [[ "$env_name" == "production" ]]; then
    prod_origins="$(grep -E '^ALLOWED_ORIGINS_PRODUCTION=' .env | tail -1 | cut -d= -f2- || true)"
    override_origins="$(grep -E '^ALLOWED_ORIGINS=' .env | tail -1 | cut -d= -f2- || true)"
    effective_origins="$prod_origins"
    if [[ -n "$override_origins" ]]; then
      effective_origins="${effective_origins:+$effective_origins,}$override_origins"
    fi

    if [[ -z "$effective_origins" ]]; then
      echo "FAIL production origin allowlist is empty"
      failed=1
    elif [[ "$effective_origins" == *"example.com"* ]]; then
      echo "FAIL replace example.com in the production origin allowlist"
      failed=1
    else
      invalid_origin=0
      IFS=',' read -r -a origin_items <<< "$effective_origins"
      for origin in "${origin_items[@]}"; do
        origin="${origin#${origin%%[![:space:]]*}}"
        origin="${origin%${origin##*[![:space:]]}}"
        if [[ "$origin" != https://* ]]; then
          echo "FAIL production origin must use HTTPS: $origin"
          failed=1
          invalid_origin=1
        fi
      done
      [[ "$invalid_origin" -eq 0 ]] && echo "OK   production origin allowlist configured"
    fi
  fi
fi

if command -v bun >/dev/null 2>&1; then
  if bun run typecheck >/dev/null 2>&1; then
    echo "OK   TypeScript typecheck"
  else
    echo "FAIL TypeScript typecheck"
    failed=1
  fi
fi

exit "$failed"
