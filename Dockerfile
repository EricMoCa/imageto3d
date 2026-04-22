# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build


# ── Stage 2: Python runtime with CUDA ─────────────────────────────────────────
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    ATTN_BACKEND=xformers \
    # HF model cache inside /data (persistent HF Space volume)
    HF_HOME=/data/huggingface \
    IMAGETO3D_MODELS_DIR=/data/models \
    IMAGETO3D_OUTPUT_DIR=/tmp/outputs

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-dev python3-pip git curl ca-certificates \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf python3.11 /usr/bin/python3 \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# ── Python deps (heavy first for layer caching) ───────────────────────────────
# PyTorch CUDA 12.1
RUN pip install --upgrade pip && \
    pip install torch==2.4.0 torchvision==0.19.0 \
        --index-url https://download.pytorch.org/whl/cu121

# xformers (compiled for CUDA 12.1 + torch 2.4)
RUN pip install xformers==0.0.27.post2 \
        --index-url https://download.pytorch.org/whl/cu121

# spconv (sparse convolution used by TRELLIS)
RUN pip install spconv-cu121

# TRELLIS source (Microsoft research repo — not on PyPI)
RUN git clone --depth 1 https://github.com/microsoft/TRELLIS /app/trellis && \
    pip install -e "/app/trellis[dev]" --no-build-isolation || \
    pip install -r /app/trellis/requirements.txt

# Application deps
COPY requirements.txt .
RUN pip install -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY backend/ backend/
COPY scripts/ scripts/

# Link TRELLIS source so sam3d_wrapper.py can find it at /app/sam-3d-objects
RUN ln -s /app/trellis /app/sam-3d-objects

# Copy built frontend
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Create output dir
RUN mkdir -p /tmp/outputs

# Non-root user required by HF Spaces
RUN useradd -m -u 1000 user
RUN chown -R user:user /app /tmp/outputs
USER user

EXPOSE 7860

CMD ["python", "-m", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", "--port", "7860", \
     "--workers", "1", "--timeout-keep-alive", "600"]
