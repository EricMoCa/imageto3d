import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Model checkpoints ─────────────────────────────────────────────────────────
# HF Space:   IMAGETO3D_MODELS_DIR=/data/models  (persistent volume)
# Desktop:    IMAGETO3D_MODELS_DIR=%APPDATA%\Imageto3D\models
# Local dev:  falls back to checkpoints/hf inside the project
_models_env = os.environ.get("IMAGETO3D_MODELS_DIR")
CHECKPOINT_PATH = Path(_models_env) if _models_env else BASE_DIR / "checkpoints" / "hf"

# ── Output directory ──────────────────────────────────────────────────────────
# HF Space:   IMAGETO3D_OUTPUT_DIR=/tmp/outputs
# Desktop:    IMAGETO3D_OUTPUT_DIR=%APPDATA%\Imageto3D\outputs
# Local dev:  backend/outputs/
_output_env = os.environ.get("IMAGETO3D_OUTPUT_DIR")
OUTPUT_DIR = Path(_output_env) if _output_env else BASE_DIR / "backend" / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In the HF Space the frontend is served by the same FastAPI process,
# so same-origin — no CORS needed. But we allow localhost for local dev.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
    # Allow all HF Space origins (*.hf.space)
    "*",
]

# Seconds before a generated file is eligible for cleanup
OUTPUT_TTL_SECONDS = 3600
