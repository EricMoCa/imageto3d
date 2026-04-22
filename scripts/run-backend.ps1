# Backend con PyTorch allocator y uvicorn (PowerShell).
# Uso: .\scripts\run-backend.ps1   (desde cualquier cwd; requiere entorno conda imageto3d)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

# xformers como backend de atención (flash-attn no disponible en Windows)
$env:ATTN_BACKEND = "xformers"
# Permite que PyTorch fragmente bloques VRAM para evitar OOM en 12 GB
$env:PYTORCH_CUDA_ALLOC_CONF = "expandable_segments:True"

conda run --no-capture-output -n imageto3d uvicorn backend.main:app --reload --port 8000
