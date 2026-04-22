"""
Descarga TRELLIS-image-large desde HuggingFace.
El progreso se emite línea a línea a stdout para que setup.rs lo capture.

Uso:
    python -m scripts.download_model
    IMAGETO3D_MODELS_DIR=C:\ruta\modelos python -m scripts.download_model
"""
import os
import sys
from pathlib import Path
from huggingface_hub import snapshot_download, list_repo_files
from huggingface_hub.file_download import hf_hub_url

REPO_ID = "JeffreyXiang/TRELLIS-image-large"


def main() -> None:
    models_dir_env = os.environ.get("IMAGETO3D_MODELS_DIR")
    if models_dir_env:
        local_dir = Path(models_dir_env)
    else:
        # fallback para desarrollo
        local_dir = Path(__file__).parent.parent / "checkpoints" / "hf"

    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"DOWNLOAD_START:{local_dir}", flush=True)

    try:
        snapshot_download(
            repo_id=REPO_ID,
            local_dir=str(local_dir),
            ignore_patterns=["*.msgpack", "flax_model*"],  # solo PyTorch weights
        )
        print("DOWNLOAD_COMPLETE", flush=True)
    except Exception as exc:
        print(f"DOWNLOAD_ERROR:{exc}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
