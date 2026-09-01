#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required. Install it from https://bun.com and rerun this script." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -base64 48 | tr -d '\n')"
    python3 - "$secret" <<'PY'
from pathlib import Path
import sys
p = Path('.env')
text = p.read_text()
text = text.replace('replace-with-at-least-32-random-characters', sys.argv[1])
p.write_text(text)
PY
    echo "Created .env with a generated APP_SECRET."
  else
    echo "Created .env. Replace APP_SECRET before production use."
  fi
else
  echo ".env already exists; leaving it unchanged."
fi

bun install
bun run typecheck
bun test

echo
echo "Setup complete. Start with: bun run dev"
echo "API/server URL: http://127.0.0.1:9388"
echo "Separate browser-client port: 9367"
echo "Allowed local pairs: localhost:9367 -> localhost:9388 or 127.0.0.1:9367 -> 127.0.0.1:9388"
