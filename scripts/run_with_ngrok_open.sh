#!/usr/bin/env bash
set -euo pipefail

# Starts the dev server and ngrok, prints the public URL, copies it to clipboard and opens browser.

VENV_DIR=".venv-whisper"
if [ -f "${VENV_DIR}/bin/activate" ]; then
  # shellcheck disable=SC1091
  . "${VENV_DIR}/bin/activate"
fi

if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs) || true
fi

PORT=${SERVER_PORT:-9367}

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install ngrok and authenticate (https://ngrok.com/download)" >&2
  exit 1
fi

echo "Starting dev server on port ${PORT}..."
bun --watch src/server.ts &
SERVER_PID=$!

trap 'echo "Shutting down..."; kill ${SERVER_PID} 2>/dev/null || true; kill $NGROK_PID 2>/dev/null || true; exit' EXIT INT TERM

sleep 1
echo "Starting ngrok (JSON logs) to http://127.0.0.1:${PORT} ..."
# Start ngrok with JSON logs so we can parse the public URL
ngrok http ${PORT} --log=stdout --log-format=json 2>&1 | {
  while IFS= read -r line; do
    # Try to extract a URL field from JSON using python
    url=$(printf '%s' "$line" | python3 -c 'import sys, json
d=sys.stdin.read().strip()
try:
    j=json.loads(d)
    for k in ("url","public_url","https_url","forwarded_url"):
        if k in j:
            print(j[k]);
            raise SystemExit(0)
except Exception:
    pass
sys.exit(1)') || true
    if [ -n "$url" ]; then
      echo "Public URL: $url"
      # copy to clipboard if possible
      if command -v wl-copy >/dev/null 2>&1; then
        printf '%s' "$url" | wl-copy
        echo "(copied to clipboard via wl-copy)"
      elif command -v xclip >/dev/null 2>&1; then
        printf '%s' "$url" | xclip -selection clipboard
        echo "(copied to clipboard via xclip)"
      elif command -v pbcopy >/dev/null 2>&1; then
        printf '%s' "$url" | pbcopy
        echo "(copied to clipboard via pbcopy)"
      fi
      # open in default browser
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" || true
      fi
      # keep streaming logs until user quits
      # record ngrok pid via pgrep
      NGROK_PID=$(pgrep -n -f "ngrok") || true
      wait
      break
    fi
  done
}
