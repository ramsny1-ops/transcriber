#!/usr/bin/env bash
set -euo pipefail

# install_local_whisper.sh
# Simple installer to create a Python venv, install ffmpeg if possible,
# and install the Whisper Python package (tiny model by default).
# Run from the repo root: ./scripts/install_local_whisper.sh

VENV_DIR=".venv-whisper"
PYTHON=${PYTHON_PATH:-python3}
MODEL=${LOCAL_WHISPER_MODEL:-tiny}

echo "Setting up local Whisper environment (venv: ${VENV_DIR}, model: ${MODEL})"

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python not found at '$PYTHON'. Please install Python 3.8+ and retry." >&2
  exit 1
fi

if [ -d "$VENV_DIR" ]; then
  echo "Reusing existing venv at $VENV_DIR"
else
  echo "Creating venv at $VENV_DIR..."
  "$PYTHON" -m venv "$VENV_DIR"
fi

ACTIVATE="$VENV_DIR/bin/activate"
# shellcheck disable=SC1091
. "$ACTIVATE"

echo "Upgrading pip tooling..."
pip install --upgrade pip setuptools wheel

echo "Checking for ffmpeg..."
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg found"
else
  echo "ffmpeg not found. On Debian/Ubuntu you can install it with: sudo apt install ffmpeg"
  if command -v apt-get >/dev/null 2>&1; then
    read -r -p "Attempt to install ffmpeg via sudo apt-get? [y/N] " answer || true
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      sudo apt-get update && sudo apt-get install -y ffmpeg
    else
      echo "Skipping ffmpeg install — transcription will likely fail without ffmpeg." >&2
    fi
  else
    echo "No supported system package manager detected; please install ffmpeg manually." >&2
  fi
fi

echo "Installing Whisper Python package (openai-whisper)..."
pip install --upgrade openai-whisper

echo "Checking for torch (CPU wheel)..."
python - <<'PY'
try:
    import torch
    print('torch present')
except Exception:
    import sys
    print('torch_missing')
    sys.exit(2)
PY
RC=$? || true
if [ "$RC" -eq 2 ]; then
  echo "Attempting to install CPU-only torch wheel (may take a while)..."
  pip install --upgrade torch --index-url https://download.pytorch.org/whl/cpu
fi

echo "Installing extras (ffmpeg-python, typing)"
pip install --upgrade ffmpeg-python

echo "Local Whisper setup complete. Activate with: source ${VENV_DIR}/bin/activate"
echo "Example: source ${VENV_DIR}/bin/activate && python scripts/transcribe.py --file path/to/file.webm --model ${MODEL}"
