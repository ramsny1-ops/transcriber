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

# safe default
NGROK_PID=""

trap 'echo "Shutting down..."; kill ${SERVER_PID} 2>/dev/null || true; if [ -n "${NGROK_PID:-}" ]; then kill ${NGROK_PID} 2>/dev/null || true; fi; exit' EXIT INT TERM

sleep 1
echo "Starting ngrok to http://127.0.0.1:${PORT} ..."
NGROK_LOG=$(mktemp /tmp/ngrok-log.XXXXXX)
ngrok http ${PORT} --log=stdout --log-format=json >"${NGROK_LOG}" 2>&1 &
NGROK_PID=$!

# Poll local ngrok API (v2/v3 compatible) for the public url
URL=""
for i in $(seq 1 30); do
    if command -v curl >/dev/null 2>&1; then
      api=$(curl -s http://127.0.0.1:4040/api/tunnels || true)
      if [ -n "$api" ] && [ "$api" != "null" ]; then
        URL=$(printf '%s' "$api" | python3 "${PWD%/}/scripts/parse_ngrok.py") || true
      fi
    fi
  if [ -n "$URL" ]; then break; fi
  # Fallback: scan ngrok log for url
  URL=$(grep -oE 'https?://[^"+]+' "${NGROK_LOG}" | tail -n 1 || true)
  if [ -n "$URL" ]; then break; fi
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "Failed to detect ngrok public URL. See ${NGROK_LOG}" >&2
  tail -n 200 "${NGROK_LOG}"
  wait ${NGROK_PID}
  exit 1
fi

echo "Public URL: $URL"
# copy to clipboard if possible (simpler, avoid complex quoting)
if command -v wl-copy >/dev/null 2>&1; then
  printf '%s' "$URL" | wl-copy && echo "(copied via wl-copy)"
elif command -v xclip >/dev/null 2>&1; then
  printf '%s' "$URL" | xclip -selection clipboard && echo "(copied via xclip)"
elif command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$URL" | pbcopy && echo "(copied via pbcopy)"
fi

# open in default browser (best-effort)
xdg-open "$URL" >/dev/null 2>&1 || true

# tail ngrok log so user sees activity, and wait for ngrok to exit
tail -f "${NGROK_LOG}" &
TAIL_PID=$!
wait ${NGROK_PID}
kill ${TAIL_PID} 2>/dev/null || true
