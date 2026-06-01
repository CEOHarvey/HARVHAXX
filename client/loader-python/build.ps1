# One EXE - no .NET required. Embeds harvey.dll + KO.exe inside.
# Default: fast incremental build. Use -Clean when icon/assets/deps changed.
param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step($msg) {
    $sec = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    Write-Host "[$sec s] $msg"
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $root "..\LicenseLoader\Payload"
$harvey = Join-Path $payload "harvey.dll"
$ko = Join-Path $payload "KO.exe"

if (-not (Test-Path $harvey)) {
    Write-Host "ERROR: Copy harvey.dll to client\LicenseLoader\Payload\harvey.dll" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ko)) {
    Write-Host "ERROR: Copy KO.exe to client\LicenseLoader\Payload\KO.exe" -ForegroundColor Red
    exit 1
}

function Test-VenvHealthy {
    param([string]$PythonExe)
    if (-not (Test-Path $PythonExe)) { return $false }
    & $PythonExe -c "import sys; sys.exit(0)" 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

$venv = Join-Path $root ".venv"
$venvPython = Join-Path $venv "Scripts\python.exe"
$depsMarker = Join-Path $venv ".build_deps_ok"
$reqFile = Join-Path $root "requirements.txt"

if ((Test-Path $venv) -and -not (Test-VenvHealthy $venvPython)) {
    Write-Host "Removing broken .venv (project was moved or Python path changed)..."
    Remove-Item -Recurse -Force $venv
    if (Test-Path $depsMarker) { Remove-Item $depsMarker -Force }
}
if (-not (Test-Path $venv)) {
    Write-Step "Creating venv (first time only)..."
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: python -m venv failed. Install Python 3.10+ and ensure 'python' is on PATH." -ForegroundColor Red
        exit 1
    }
    $venvPython = Join-Path $venv "Scripts\python.exe"
    $Clean = $true
}

$needPip = $Clean -or -not (Test-Path $depsMarker)
if (-not $needPip -and (Test-Path $reqFile)) {
    if ((Get-Item $reqFile).LastWriteTime -gt (Get-Item $depsMarker).LastWriteTime) {
        $needPip = $true
    }
}
if ($needPip) {
    Write-Step "Installing Python packages (first time or requirements changed)..."
    & $venvPython -m pip install -q -r $reqFile
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Set-Content -Path $depsMarker -Value (Get-Date).ToString("o")
}
else {
    Write-Step "Skipping pip (deps already installed)"
}

$appsettings = Join-Path $root "appsettings.json"
$assets = Join-Path $root "loader\assets"
$entry = Join-Path $root "loader\__main__.py"
$icon = Join-Path $assets "app.ico"
$brandFile = Join-Path $assets "brand.png"

if (-not (Test-Path $brandFile)) {
    Write-Host "ERROR: Missing loader\assets\brand.png (square logo for EXE icon)" -ForegroundColor Red
    exit 1
}

$needIcon = $Clean -or -not (Test-Path $icon) -or ((Get-Item $brandFile).LastWriteTime -gt (Get-Item $icon).LastWriteTime)
if ($needIcon) {
    Write-Step "Updating app.ico from brand.png..."
    & $venvPython (Join-Path $root "scripts\prepare_assets.py")
}
else {
    Write-Step "Skipping icon prep (unchanged)"
}

$buildDir = Join-Path $root "build"
$distDir = Join-Path $root "dist"
if ($Clean) {
    Write-Step "Clean rebuild — removing build cache..."
    if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
    if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
}

$iconArg = @()
if (Test-Path $icon) {
    $iconArg = @("--icon", $icon)
}

$pyiArgs = @(
    "--noconfirm", "--onefile", "--windowed",
    "--name", "LicenseLoader",
    "--paths", $root,
    "--hidden-import", "certifi",
    "--hidden-import", "PIL",
    "--hidden-import", "PIL.Image",
    "--hidden-import", "PIL.ImageTk",
    "--add-data", "$appsettings;.",
    "--add-data", "$assets;assets",
    "--add-data", "$harvey;Payload",
    "--add-data", "$ko;Payload"
) + $iconArg + @($entry)

if ($Clean) {
    $pyiArgs = @("--clean") + $pyiArgs
}

Write-Step "PyInstaller $(if ($Clean) { '(full clean)' } else { '(incremental - use -Clean if icon stuck)' })..."
& $venvPython -m PyInstaller @pyiArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$out = Join-Path $distDir "LicenseLoader.exe"
if (Test-Path $out) {
    $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
    $elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds)
    Write-Host ""
    Write-Host ('SUCCESS ({0}s):' -f $elapsedSec) -ForegroundColor Green
    Write-Host $out
    Write-Host "Size: $mb MB (no .NET 8 needed)"
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Yellow
    Write-Host "  Normal rebuild:  .\build.ps1          (fast)"
    Write-Host "  Full rebuild:    .\build.ps1 -Clean   (slower, fresh icon/cache)"
    if (-not $Clean) {
        Write-Host "  Old EXE icon?     Run with -Clean once"
    }
}
else {
    Write-Host "Build failed - dist\LicenseLoader.exe not found." -ForegroundColor Red
    exit 1
}
