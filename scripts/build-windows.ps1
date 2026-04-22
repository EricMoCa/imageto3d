<#
.SYNOPSIS
    Build the Imageto3D Windows installer.

.DESCRIPTION
    1. Builds the React frontend (npm run build)
    2. Downloads uv.exe into src-tauri/resources/
    3. Copies requirements_worker.txt into src-tauri/resources/
    4. Generates placeholder icons if none exist
    5. Runs tauri build to produce the NSIS/MSI installer

.NOTES
    Requirements:
      - Node.js >= 18 (npm in PATH)
      - Rust + Cargo (https://rustup.rs)
      - MSVC Build Tools (cl.exe in PATH via Visual Studio Developer Prompt)

    Output:
      src-tauri/target/release/bundle/nsis/Imageto3D_1.0.0_x64-setup.exe
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "== Imageto3D Windows Build ==" -ForegroundColor Cyan

# --- 1. Frontend ---
Write-Host ""
Write-Host "[1/5] Building React frontend..." -ForegroundColor Yellow
Push-Location "$root\frontend"
npm ci --prefer-offline
npm run build
Pop-Location
Write-Host "Frontend built." -ForegroundColor Green

# --- 2. Download uv.exe ---
$resourcesDir = "$root\src-tauri\resources"
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

$uvExe = "$resourcesDir\uv.exe"
if (-not (Test-Path $uvExe)) {
    Write-Host ""
    Write-Host "[2/5] Downloading uv.exe..." -ForegroundColor Yellow
    $uvZip = "$env:TEMP\uv-windows.zip"
    $uvUrl = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
    Invoke-WebRequest -Uri $uvUrl -OutFile $uvZip -UseBasicParsing
    Expand-Archive -Path $uvZip -DestinationPath "$env:TEMP\uv-extract" -Force
    $extracted = Get-ChildItem "$env:TEMP\uv-extract" -Filter "uv.exe" -Recurse | Select-Object -First 1
    Copy-Item $extracted.FullName $uvExe
    Remove-Item $uvZip
    Remove-Item "$env:TEMP\uv-extract" -Recurse -Force
    Write-Host "uv.exe downloaded." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[2/5] uv.exe already present - skipping." -ForegroundColor Gray
}

# --- 3. Copy requirements ---
Write-Host ""
Write-Host "[3/5] Copying requirements_worker.txt..." -ForegroundColor Yellow
Copy-Item "$root\requirements_worker.txt" "$resourcesDir\requirements_worker.txt" -Force
Write-Host "requirements_worker.txt copied." -ForegroundColor Green

# --- 4. Icons ---
Write-Host ""
Write-Host "[4/5] Checking icons..." -ForegroundColor Yellow
$iconsDir = "$root\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$iconFiles = @("32x32.png", "128x128.png", "128x128@2x.png")
$missingIcons = $iconFiles | Where-Object { -not (Test-Path "$iconsDir\$_") }

if ($missingIcons -or -not (Test-Path "$iconsDir\icon.ico")) {
    Write-Host "Generating placeholder icons..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.Drawing

    foreach ($iconFile in @(
        @{Name="32x32.png"; Size=32},
        @{Name="128x128.png"; Size=128},
        @{Name="128x128@2x.png"; Size=256}
    )) {
        $dst = "$iconsDir\$($iconFile.Name)"
        if (-not (Test-Path $dst)) {
            $sz = $iconFile.Size
            $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.Clear([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
            $font = New-Object System.Drawing.Font("Arial", [Math]::Max(8, $sz / 4), [System.Drawing.FontStyle]::Bold)
            $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
            $g.DrawString("3D", $font, $brush, [System.Drawing.RectangleF]::new(0, 0, $sz, $sz), $sf)
            $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
            $g.Dispose()
            $bmp.Dispose()
        }
    }

    # Create a minimal ICO from the 32x32 PNG
    $icoPath = "$iconsDir\icon.ico"
    if (-not (Test-Path $icoPath)) {
        $src = [System.Drawing.Image]::FromFile("$iconsDir\32x32.png")
        $ms = New-Object System.IO.MemoryStream
        $src.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBytes = $ms.ToArray()
        $ms.Dispose()
        $src.Dispose()

        # ICO header: reserved(2) + type ICO(2) + count(2)
        $icoHeader = [byte[]](0, 0, 1, 0, 1, 0)
        # Directory entry: width, height, colorCount, reserved, planes(2), bitCount(2), size(4), offset(4)
        # offset = 6 (header) + 16 (entry) = 22
        $pngLen = $pngBytes.Length
        $dirEntry = [byte[]](
            32, 32, 0, 0,
            1, 0,
            32, 0,
            ($pngLen -band 0xFF),
            (($pngLen -shr 8) -band 0xFF),
            (($pngLen -shr 16) -band 0xFF),
            (($pngLen -shr 24) -band 0xFF),
            22, 0, 0, 0
        )
        [System.IO.File]::WriteAllBytes($icoPath, $icoHeader + $dirEntry + $pngBytes)
    }
    Write-Host "Icons generated." -ForegroundColor Green
} else {
    Write-Host "Icons already present." -ForegroundColor Gray
}

# --- 5. Tauri build ---
# Must run from the project root (parent of src-tauri/), not from frontend/.
# Use the tauri binary installed in frontend/node_modules.
Write-Host ""
Write-Host "[5/5] Building Tauri application..." -ForegroundColor Yellow
Push-Location $root
& "$root\frontend\node_modules\.bin\tauri.cmd" build
Pop-Location

# --- Summary ---
Write-Host ""
Write-Host "== Build Complete! ==" -ForegroundColor Green
$installer = Get-ChildItem "$root\src-tauri\target\release\bundle\nsis" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($installer) {
    Write-Host "Installer: $($installer.FullName)" -ForegroundColor Cyan
    Write-Host "Size: $([Math]::Round($installer.Length / 1MB, 1)) MB" -ForegroundColor Cyan
} else {
    $msi = Get-ChildItem "$root\src-tauri\target\release\bundle\msi" -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msi) {
        Write-Host "Installer: $($msi.FullName)" -ForegroundColor Cyan
    } else {
        Write-Host "Installer not found - check build output above." -ForegroundColor Yellow
    }
}
