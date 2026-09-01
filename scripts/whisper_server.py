#!/usr/bin/env python3
import os
import tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)

MODEL_NAME = os.environ.get("LOCAL_WHISPER_MODEL", "tiny")

print("Loading Whisper model:", MODEL_NAME)
try:
    import whisper
    model = whisper.load_model(MODEL_NAME)
except Exception as e:
    print("Failed to load whisper model:", e)
    model = None


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if model is None:
        return jsonify({"error": "model_not_loaded"}), 503
    if "file" not in request.files:
        return jsonify({"error": "no_file"}), 400
    f = request.files["file"]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        f.save(tmp.name)
        tmp_path = tmp.name
    try:
        result = model.transcribe(tmp_path, verbose=False)
        segments = result.get("segments", [])
        # normalize to start/end/text
        out = []
        for s in segments:
            out.append({
                "start": s.get("start"),
                "end": s.get("end"),
                "text": s.get("text"),
            })
        return jsonify({"segments": out})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


if __name__ == "__main__":
    port = int(os.environ.get("LOCAL_WHISPER_PORT", "5100"))
    app.run(host="127.0.0.1", port=port)
