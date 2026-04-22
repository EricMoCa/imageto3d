# Setup backend Imageto3D + TRELLIS en Windows (PowerShell).
#
# Estado actual (2026-04-21): pasos 1-5 YA COMPLETADOS en este equipo.
#   - Entorno conda "imageto3d" con Python 3.10 existe
#   - PyTorch 2.4.0+cu121, xformers, spconv, kaolin instalados
#   - TRELLIS clonado en sam-3d-objects/
#   - Modelo descargado en checkpoints/hf/
#
# Para reinstalar desde cero en otro equipo, descomenta todos los bloques.
# Ejecutar desde la raíz del proyecto:  .\scripts\setup-imageto3d-windows.ps1
# Requiere: Miniconda/Anaconda, Git, NVIDIA driver >= 527.

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root
Write-Host "Raíz del proyecto: $Root"

# ── 1. Entorno conda (Python 3.10 requerido por TRELLIS) ─────────────────────
# ESTADO: completado
# conda create -n imageto3d python=3.10 -y
# conda run -n imageto3d pip install torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu121

# ── 2. TRELLIS repo ───────────────────────────────────────────────────────────
# ESTADO: completado (sam-3d-objects/ existe)
# if (-not (Test-Path "sam-3d-objects\.git")) {
#     git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git sam-3d-objects
# } else {
#     Push-Location sam-3d-objects; git submodule update --init --recursive; Pop-Location
# }

# ── 3. Dependencias Python ────────────────────────────────────────────────────
# ESTADO: completado (torch, xformers, spconv-cu120, kaolin, rembg, etc.)
# conda run -n imageto3d pip install `
#     "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8" `
#     huggingface_hub pillow imageio imageio-ffmpeg tqdm easydict `
#     opencv-python-headless scipy ninja rembg onnxruntime `
#     trimesh open3d xatlas pyvista pymeshfix igraph transformers
# conda run -n imageto3d pip install xformers==0.0.27.post2 --index-url https://download.pytorch.org/whl/cu121
# conda run -n imageto3d pip install spconv-cu120
# conda run -n imageto3d pip install kaolin -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.4.0_cu121.html
# conda run -n imageto3d pip install "numpy<2"
# conda run -n imageto3d pip install -r backend/requirements.txt

# ── 4. nvdiffrast (opcional — mejora calidad de mallas, requiere CUDA Toolkit) ──
# ESTADO: pendiente. Sin nvdiffrast la inferencia funciona; con él mejora la malla.
# Descargar CUDA Toolkit 12.x desde https://developer.nvidia.com/cuda-downloads
# Luego:
#   $env:CUDA_HOME = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.x"
#   conda run -n imageto3d pip install .\extensions\nvdiffrast --no-build-isolation
Write-Host "[4] nvdiffrast: omitido (no requiere CUDA Toolkit para inferencia basica)."

# ── 5. Modelo TRELLIS-image-large (~10 GB desde HuggingFace) ─────────────────
# ESTADO: completado (checkpoints/hf/ contiene los .safetensors)
# conda run -n imageto3d python -c "
#   from huggingface_hub import snapshot_download
#   snapshot_download('JeffreyXiang/TRELLIS-image-large', local_dir='checkpoints/hf')
# "

Write-Host ""
Write-Host "Setup completo. Inicia el proyecto con:"
Write-Host "  Backend:  .\scripts\run-backend.ps1"
Write-Host "  Frontend: .\scripts\run-frontend.ps1"
