# Local Whisper setup

This project can optionally run local Whisper transcription via `scripts/transcribe.py`.

Quick install (Linux, Debian/Ubuntu):

1. From the repo root run the installer script:

```bash
./scripts/install_local_whisper.sh
```

2. Activate the venv and test transcription:

```bash
source .venv-whisper/bin/activate
python scripts/transcribe.py --help
```

Environment variables

- `USE_LOCAL_WHISPER=true` — enable local transcription in the server
- `LOCAL_WHISPER_MODEL=tiny` — choose model (tiny, base, small, medium, large)
- `PYTHON_PATH` — path to Python binary used by server when spawning the script

Notes

- The script will try to install `ffmpeg` via `apt-get` if available and you confirm. If you use another distro, install `ffmpeg` manually.
- Installing `torch` may take time; the script attempts a CPU wheel install from PyTorch's CPU index.
- If you run into dependency issues, ensure you have a recent Python (3.8+) and system build tools.
