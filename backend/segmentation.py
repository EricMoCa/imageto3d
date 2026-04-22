import numpy as np
from PIL import Image
from typing import Literal

# Lazy-cache de sesiones rembg: una por modelo, se crea la primera vez que se usa.
_sessions: dict[str, object] = {}

# Mapa de estilo → modelo rembg
_STYLE_MODEL: dict[str, str] = {
    "photo": "u2net",
    "anime": "isnet-anime",
    "art":   "isnet-anime",
}


def auto_segment(
    image: Image.Image,
    style: Literal["photo", "anime", "art"] = "photo",
) -> np.ndarray:
    """Return a binary uint8 mask (255=foreground) using background removal.

    Args:
        image: Input PIL image.
        style: Image style hint. 'photo' uses u2net; 'anime'/'art' use isnet-anime,
               which handles flat colors and illustrated characters much better.
    """
    try:
        import rembg
    except ImportError as exc:
        raise RuntimeError("rembg is not installed. Run: pip install rembg") from exc

    model_name = _STYLE_MODEL.get(style, "u2net")

    if model_name not in _sessions:
        _sessions[model_name] = rembg.new_session(model_name)

    session = _sessions[model_name]
    rgba = rembg.remove(image.convert("RGBA"), session=session)
    alpha = np.array(rgba)[:, :, 3]
    mask = np.where(alpha > 10, 255, 0).astype(np.uint8)
    return mask
