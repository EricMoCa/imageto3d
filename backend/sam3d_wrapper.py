import asyncio
import os
import sys
import uuid
import numpy as np
import torch
from pathlib import Path
from PIL import Image
from typing import Literal

from backend.config import BASE_DIR, CHECKPOINT_PATH, OUTPUT_DIR

# TRELLIS: código en sam-3d-objects (sin paquete pip en Windows; ver scripts/setup-imageto3d-windows.ps1).
_trellis_root = BASE_DIR / "sam-3d-objects"
if _trellis_root.is_dir():
    _root = str(_trellis_root.resolve())
    if _root not in sys.path:
        sys.path.insert(0, _root)

# Sin flash-attn (p. ej. Windows), TRELLIS usa xformers si se define antes de importar módulos sparse.
os.environ.setdefault("ATTN_BACKEND", "xformers")

# Parámetros de sampler según nivel de calidad.
_QUALITY_PARAMS: dict[str, dict] = {
    "fast":     {"ss": {"steps": 25, "cfg_strength": 5.0}, "slat": {"steps": 25, "cfg_strength": 5.0}},
    "balanced": {"ss": {"steps": 40, "cfg_strength": 7.5}, "slat": {"steps": 40, "cfg_strength": 5.0}},
    "quality":  {"ss": {"steps": 50, "cfg_strength": 7.5}, "slat": {"steps": 50, "cfg_strength": 5.0}},
}


class SAM3DWrapper:
    """Singleton wrapper around TRELLIS TrellisImageTo3DPipeline. Thread-safe via asyncio.Lock."""

    def __init__(self) -> None:
        if not CHECKPOINT_PATH.exists():
            raise FileNotFoundError(
                f"Model directory not found: {CHECKPOINT_PATH}\n"
                "Run the setup commands to download the model:\n"
                "  python -c \"from huggingface_hub import snapshot_download; "
                "snapshot_download('JeffreyXiang/TRELLIS-image-large', local_dir='checkpoints/hf')\""
            )

        from trellis.pipelines import TrellisImageTo3DPipeline  # noqa: PLC0415

        self._pipeline = TrellisImageTo3DPipeline.from_pretrained(str(CHECKPOINT_PATH))
        self._pipeline.cuda()
        self._lock = asyncio.Lock()

    # ── Single-image ──────────────────────────────────────────────────────────

    async def generate(
        self,
        image: Image.Image,
        mask: np.ndarray,
        quality: Literal["fast", "balanced", "quality"] = "balanced",
        seed: int = 42,
    ) -> Path:
        """Run the TRELLIS single-image pipeline and return the GLB path."""
        params = _QUALITY_PARAMS.get(quality, _QUALITY_PARAMS["balanced"])
        async with self._lock:
            rgba = _apply_mask(image, mask)
            loop = asyncio.get_running_loop()
            out_path = await loop.run_in_executor(
                None, self._run_sync, rgba, seed, params["ss"], params["slat"]
            )
            torch.cuda.empty_cache()
            return out_path

    def _run_sync(
        self,
        rgba: Image.Image,
        seed: int,
        ss_params: dict,
        slat_params: dict,
    ) -> Path:
        with torch.inference_mode():
            outputs = self._pipeline.run(
                rgba,
                seed=seed,
                sparse_structure_sampler_params=ss_params,
                slat_sampler_params=slat_params,
            )
        out_path = OUTPUT_DIR / f"{uuid.uuid4().hex}.glb"
        _export_mesh(outputs["gaussian"][0], outputs["mesh"][0], out_path)
        return out_path

    # ── Multi-image ───────────────────────────────────────────────────────────

    async def generate_multi(
        self,
        images: list[Image.Image],
        masks: list[np.ndarray],
        quality: Literal["fast", "balanced", "quality"] = "balanced",
        mode: Literal["stochastic", "multidiffusion"] = "multidiffusion",
        seed: int = 42,
    ) -> Path:
        """Run the TRELLIS multi-image pipeline and return the GLB path."""
        params = _QUALITY_PARAMS.get(quality, _QUALITY_PARAMS["balanced"])
        async with self._lock:
            rgbas = [_apply_mask(img, msk) for img, msk in zip(images, masks)]
            loop = asyncio.get_running_loop()
            out_path = await loop.run_in_executor(
                None, self._run_multi_sync, rgbas, seed, params["ss"], params["slat"], mode
            )
            torch.cuda.empty_cache()
            return out_path

    def _run_multi_sync(
        self,
        rgbas: list[Image.Image],
        seed: int,
        ss_params: dict,
        slat_params: dict,
        mode: str,
    ) -> Path:
        with torch.inference_mode():
            outputs = self._pipeline.run_multi_image(
                rgbas,
                seed=seed,
                sparse_structure_sampler_params=ss_params,
                slat_sampler_params=slat_params,
                mode=mode,
            )
        out_path = OUTPUT_DIR / f"{uuid.uuid4().hex}.glb"
        _export_mesh(outputs["gaussian"][0], outputs["mesh"][0], out_path)
        return out_path


# ── Helpers ───────────────────────────────────────────────────────────────────

def _apply_mask(image: Image.Image, mask: np.ndarray) -> Image.Image:
    """Apply a binary mask (255=foreground) to the alpha channel of the image."""
    rgba = image.convert("RGBA")
    r, g, b, _ = rgba.split()
    alpha = Image.fromarray(mask, mode="L")
    return Image.merge("RGBA", (r, g, b, alpha))


def _export_mesh(gaussian_rep, mesh_result, out_path: Path) -> None:
    """
    Export to GLB.

    With nvdiffrast installed: textured mesh via postprocessing_utils.to_glb().
    Without it: raw geometry mesh via trimesh (no texture baking).
    """
    try:
        from trellis.utils.postprocessing_utils import to_glb  # imports nvdiffrast internally
        tmesh = to_glb(gaussian_rep, mesh_result, simplify=0.95, texture_size=1024, verbose=False)
        tmesh.export(str(out_path))
        return
    except Exception:
        pass  # nvdiffrast not installed or other error — fall back to raw export

    import trimesh as _trimesh

    vertices = mesh_result.vertices.cpu().float().numpy()
    faces = mesh_result.faces.cpu().numpy()
    # Rotate from z-up (TRELLIS internal) to y-up (GLB standard)
    rot = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float32)
    vertices = vertices @ rot
    tmesh = _trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    tmesh.export(str(out_path))
