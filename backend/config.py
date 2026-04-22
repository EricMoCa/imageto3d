import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Model checkpoints ─────────────────────────────────────────────────────────
# In production (Tauri), IMAGETO3D_MODELS_DIR points to %APPDATA%\Imageto3D\models\
# In development, falls back to checkpoints/hf inside the project.
_models_env = os.environ.get("IMAGETO3D_MODELS_DIR")
CHECKPOINT_PATH = Path(_models_env) if _models_env else BASE_DIR / "checkpoints" / "hf"

# ── Output directory ──────────────────────────────────────────────────────────
# In production (Tauri), IMAGETO3D_OUTPUT_DIR points to %APPDATA%\Imageto3D\outputs\
# In development, uses backend/outputs/ inside the project.
_output_env = os.environ.get("IMAGETO3D_OUTPUT_DIR")
OUTPUT_DIR = Path(_output_env) if _output_env else BASE_DIR / "backend" / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── CORS ──────────────────────────────────────────────────────────────────────
# tauri://localhost → Tauri webview origin (production)
# http://localhost:5173 → Vite dev server (development)
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
]

# Seconds before a generated file is eligible for cleanup
OUTPUT_TTL_SECONDS = 3600
