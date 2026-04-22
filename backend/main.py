import asyncio
import io
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from backend.config import CHECKPOINT_PATH, CORS_ORIGINS, OUTPUT_DIR, OUTPUT_TTL_SECONDS
from backend.sam3d_wrapper import SAM3DWrapper
from backend.segmentation import auto_segment


def _download_model_if_needed() -> None:
    """Download TRELLIS weights from HF Hub if not already present."""
    if CHECKPOINT_PATH.exists() and any(CHECKPOINT_PATH.iterdir()):
        return
    print(f"[setup] Downloading TRELLIS model to {CHECKPOINT_PATH} ...")
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(
            "JeffreyXiang/TRELLIS-image-large",
            local_dir=str(CHECKPOINT_PATH),
            ignore_patterns=["*.bin"],   # prefer safetensors
        )
        print("[setup] Model download complete.")
    except Exception as exc:
        print(f"[setup] Model download failed: {exc}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Download model weights if missing (first run on HF Space)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _download_model_if_needed)

    app.state.wrapper = SAM3DWrapper()
    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    cleanup_task.cancel()


app = FastAPI(title="Image to 3D API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Single-image endpoint ─────────────────────────────────────────────────────

@app.post("/generate-3d")
async def generate_3d(
    image: Annotated[UploadFile, File()],
    quality: Annotated[Literal["fast", "balanced", "quality"], Form()] = "balanced",
    style: Annotated[Literal["photo", "anime", "art"], Form()] = "photo",
):
    pil_image = await _read_image(image)

    try:
        mask = auto_segment(pil_image, style=style)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        glb_path: Path = await app.state.wrapper.generate(pil_image, mask, quality=quality)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

    return {"url": f"/files/{glb_path.name}"}


# ── Multi-image endpoint ──────────────────────────────────────────────────────

@app.post("/generate-3d-multi")
async def generate_3d_multi(
    images: Annotated[list[UploadFile], File()],
    quality: Annotated[Literal["fast", "balanced", "quality"], Form()] = "balanced",
    style: Annotated[Literal["photo", "anime", "art"], Form()] = "photo",
    mode: Annotated[Literal["stochastic", "multidiffusion"], Form()] = "multidiffusion",
):
    if not 2 <= len(images) <= 4:
        raise HTTPException(status_code=400, detail="Provide between 2 and 4 images.")

    pil_images = [await _read_image(img) for img in images]

    try:
        masks = [auto_segment(img, style=style) for img in pil_images]
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        glb_path: Path = await app.state.wrapper.generate_multi(
            pil_images, masks, quality=quality, mode=mode
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

    return {"url": f"/files/{glb_path.name}"}


# ── File serving ──────────────────────────────────────────────────────────────

@app.get("/files/{filename}")
async def serve_file(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists() or path.suffix != ".glb":
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type="model/gltf-binary", filename=filename)


@app.get("/health")
async def health():
    return {"status": "ok", "worker": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _read_image(upload: UploadFile) -> Image.Image:
    if not upload.content_type or not upload.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"File '{upload.filename}' must be an image.")
    data = await upload.read()
    try:
        return Image.open(io.BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read image: {exc}") from exc


async def _cleanup_loop():
    while True:
        await asyncio.sleep(300)
        now = time.time()
        for f in OUTPUT_DIR.glob("*.glb"):
            if now - f.stat().st_mtime > OUTPUT_TTL_SECONDS:
                f.unlink(missing_ok=True)


# ── Serve React frontend (must be last — catches all unmatched routes) ─────────
# When running as a HF Space Docker container, the built frontend lives at
# /app/frontend/dist. In local dev, the Vite dev server handles the frontend.
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
