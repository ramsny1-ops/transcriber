#!/usr/bin/env bash
set -euo pipefail

# init.sh
# Ensures venv, starts local whisper HTTP server, then starts dev server + ngrok.

VENV_DIR=".venv-whisper"
if [ ! -d "$VENV_DIR" ]; then
  echo "Local venv not found; running installer..."
  bash scripts/install_local_whisper.sh
fi

echo "Activating venv"
# shellcheck disable=SC1091
. "$VENV_DIR/bin/activate"

echo "Starting local Whisper HTTP server (background)"
LOCAL_PORT=${LOCAL_WHISPER_PORT:-5100}
python scripts/whisper_server.py &
WHISPER_PID=$!

echo "Whisper server PID: ${WHISPER_PID} (listening on 127.0.0.1:${LOCAL_PORT})"

echo "Starting Bun dev server with ngrok and opening public URL..."
bun run dev:ngrok:open

trap 'echo "Shutting down..."; kill ${WHISPER_PID} 2>/dev/null || true; exit' EXIT INT TERM
