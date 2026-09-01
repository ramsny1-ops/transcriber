#!/usr/bin/env python3
"""
Simple local transcription helper using OpenAI's whisper model (tiny).
Usage:
  python3 scripts/transcribe.py --file /path/to/audio.webm --model tiny

Outputs JSON to stdout with top-level {"segments": [ {start, end, text}, ... ] }

Note: Install with `python3 -m pip install -U openai-whisper` (or `pip install -U openai-whisper`).
"""
import argparse
import json
import sys

try:
    import whisper
except Exception as e:
    print(json.dumps({"error": "missing_whisper", "message": str(e)}))
    sys.exit(2)

parser = argparse.ArgumentParser()
parser.add_argument("--file", required=True)
parser.add_argument("--model", default="tiny")
args = parser.parse_args()

model = whisper.load_model(args.model)
result = model.transcribe(args.file, word_timestamps=False)
# result['segments'] contains start/end in seconds and text
segments = []
for s in result.get("segments", []):
    segments.append({
        "start": s.get("start"),
        "end": s.get("end"),
        "text": s.get("text").strip(),
    })

print(json.dumps({"segments": segments}))
