"""
Python inference worker — usado ÚNICAMENTE en modo producción (ejecutable Tauri).
Solo expone /infer y /infer-multi. Todo el routing, file-serving y cleanup
están en el servidor Axum (Rust).

Arranque (gestionado por Tauri/Rust):
    uvicorn backend.worker:app --host 127.0.0.1 --port 8001
"""
import asyncio
import base64
import io
import logging

from fastapi import FastAPI, Request, HTTPException
from PIL import Image

from backend.sam3d_wrapper import SAM3DWrapper
from backend.segmentation import auto_segment

logging.basicConfig(level=logging.INFO, format="%(asctime)s [worker] %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Imageto3D Inference Worker", docs_url=None, redoc_url=None)

_wrapper: SAM3DWrapper | None = None


@app.on_event("startup")
async def _startup() -> None:
    global _wrapper
    log.info("Cargando modelo TRELLIS en GPU...")
    _wrapper = SAM3DWrapper()
    log.info("Modelo listo.")


@app.get("/worker-health")
async def worker_health() -> dict:
    return {"status": "ok", "model_loaded": _wrapper is not None}


@app.post("/infer")
async def infer(req: Request) -> dict:
    """Single-image inference.

    Body JSON:
        image_b64: str   — imagen PNG/JPG en base64
        quality:   str   — "fast" | "balanced" | "quality"
        style:     str   — "photo" | "anime" | "art"
        seed:      int   — (opcional, default 42)
    """
    if _wrapper is None:
        raise HTTPException(503, "Model not loaded yet.")

    body = await req.json()
    image = _decode_image(body.get("image_b64", ""))
    mask = auto_segment(image, style=body.get("style", "photo"))
    glb_path = await _wrapper.generate(
        image, mask,
        quality=body.get("quality", "balanced"),
        seed=int(body.get("seed", 42)),
    )
    return {"glb_path": str(glb_path)}


@app.post("/infer-multi")
async def infer_multi(req: Request) -> dict:
    """Multi-image inference (2-4 views of the same object).

    Body JSON:
        images_b64: list[str]   — imágenes en base64
        quality:    str
        style:      str
        mode:       str   — "stochastic" | "multidiffusion"
        seed:       int
    """
    if _wrapper is None:
        raise HTTPException(503, "Model not loaded yet.")

    body = await req.json()
    images_b64 = body.get("images_b64", [])
    if not 2 <= len(images_b64) <= 4:
        raise HTTPException(400, "Provide 2–4 images.")

    images = [_decode_image(b64) for b64 in images_b64]
    masks = [auto_segment(img, style=body.get("style", "photo")) for img in images]
    glb_path = await _wrapper.generate_multi(
        images, masks,
        quality=body.get("quality", "balanced"),
        mode=body.get("mode", "multidiffusion"),
        seed=int(body.get("seed", 42)),
    )
    return {"glb_path": str(glb_path)}


# ── helpers ───────────────────────────────────────────────────────────────────

def _decode_image(b64: str) -> Image.Image:
    try:
        data = base64.b64decode(b64)
        return Image.open(io.BytesIO(data))
    except Exception as exc:
        raise HTTPException(400, f"Invalid image data: {exc}") from exc
