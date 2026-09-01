#!/usr/bin/env bash
set -euo pipefail

# run_with_ngrok.sh
# Activates venv (if present), loads .env, starts the dev server, and opens an ngrok http tunnel.

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

trap 'echo "Shutting down..."; kill ${SERVER_PID} 2>/dev/null || true; exit' EXIT INT TERM

sleep 1
echo "Starting ngrok tunnel to http://127.0.0.1:${PORT} ..."
ngrok http ${PORT} --log=stdout
