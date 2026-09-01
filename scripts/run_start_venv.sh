#!/usr/bin/env bash
set -euo pipefail

VENV_DIR=".venv-whisper"
if [ -f "${VENV_DIR}/bin/activate" ]; then
  # shellcheck disable=SC1091
  . "${VENV_DIR}/bin/activate"
else
  echo "Warning: venv not found at ${VENV_DIR}; continuing without activating venv"
fi

if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs) || true
fi

exec bun src/server.ts
