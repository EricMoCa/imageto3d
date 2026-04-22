---
title: Image to 3D
emoji: 🧊
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
license: mit
app_port: 7860
hardware: a10g-small
---

# Image to 3D — TRELLIS

Convert a single image (or up to 4 multi-view images) into a downloadable 3D model (GLB) using [TRELLIS](https://github.com/microsoft/TRELLIS).

## Local development

```bash
# Backend (FastAPI + TRELLIS)
python -m uvicorn backend.main:app --reload --port 8000

# Frontend (Vite + React)
cd frontend && npm run dev
```

## HF Space deployment

The Space runs entirely in Docker:
- FastAPI serves the API on port 7860
- The built React frontend is served as static files from the same server
- TRELLIS model weights are downloaded from HF Hub on first startup
- GPU required: A10G or better (VRAM >= 12 GB)
