# Frontend Vite (PowerShell).
# Uso: .\scripts\run-frontend.ps1
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location (Join-Path $Root "frontend")
if (-not (Test-Path "node_modules")) { npm install }
npm run dev
