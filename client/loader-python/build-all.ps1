<#
  build-all.ps1 - builds one Python (PyInstaller) loader EXE per product.

  - Spoofer and Macro ship WITHOUT the KO.exe payload (KO is KnivesOut-only).
  - Each product embeds its own "Product" value so the server enforces which
    keys work. Original appsettings.json is always restored, even on failure.

  Usage (from this folder):
      powershell -ExecutionPolicy Bypass -File .\build-all.ps1
      powershell -ExecutionPolicy Bypass -File .\build-all.ps1 -Products spoofer
      powershell -ExecutionPolicy Bypass -File .\build-all.ps1 -Clean
#>
param(
    # This codebase IS the KnivesOut loader (harvey.dll + KO.exe payloads).
    # Spoofer/Macro need their own payloads before they can be built here.
    [string[]]$Products = @('knivesout'),
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# product id -> output exe name; only knivesout carries the KO payload.
$OutNames = @{
    spoofer   = 'HarvciousSpoofer'
    macro     = 'HarvciousMacro'
    knivesout = 'HarvciousKnivesOut'
}
$ProductsWithKo = @('knivesout')

$payloadDir = Join-Path $root '..\LicenseLoader\Payload'
$harvey     = Join-Path $payloadDir 'harvey.dll'
$ko         = Join-Path $payloadDir 'KO.exe'
$appsettings = Join-Path $root 'appsettings.json'
$assets     = Join-Path $root 'loader\assets'
$entry      = Join-Path $root 'loader\__main__.py'
$icon       = Join-Path $assets 'app.ico'
$brandFile  = Join-Path $assets 'brand.png'
$distDir    = Join-Path $root 'dist'
$outDir     = Join-Path $root 'dist-products'

if (-not (Test-Path $harvey)) { throw "Missing payload: $harvey" }
if (-not (Test-Path $brandFile)) { throw "Missing loader\assets\brand.png" }

# ---- venv + deps (once) ----
$venv = Join-Path $root '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    Write-Host 'Creating venv (first time)...' -ForegroundColor DarkGray
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'python -m venv failed. Install Python 3.10+ and put it on PATH.' }
    & $venvPython -m pip install -q -r (Join-Path $root 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }
}

# ---- icon from brand.png ----
$needIcon = $Clean -or -not (Test-Path $icon) -or ((Get-Item $brandFile).LastWriteTime -gt (Get-Item $icon).LastWriteTime)
if ($needIcon) {
    Write-Host 'Updating app.ico from brand.png...' -ForegroundColor DarkGray
    & $venvPython (Join-Path $root 'scripts\prepare_assets.py')
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$backup = Join-Path $root 'appsettings.json.bak'
Copy-Item $appsettings $backup -Force
$originalJson = Get-Content $appsettings -Raw

try {
    foreach ($product in $Products) {
        $product = $product.ToLower()
        if (-not $OutNames.ContainsKey($product)) { Write-Warning "Unknown product '$product' - skipping."; continue }

        $outName = $OutNames[$product]
        $withKo  = $ProductsWithKo -contains $product
        Write-Host ("=== Building {0} ({1}) KO={2} ===" -f $outName, $product, $withKo) -ForegroundColor Cyan

        # Bake product + KO flag into the embedded config.
        $cfg = $originalJson | ConvertFrom-Json
        $cfg.Product = $product
        $cfg.UseEmbeddedKo = $withKo
        $json = $cfg | ConvertTo-Json -Depth 20
        [System.IO.File]::WriteAllText($appsettings, $json, (New-Object System.Text.UTF8Encoding($false)))

        # Fresh build dirs per product so caches never bleed KO between them.
        $buildDir = Join-Path $root ("build\" + $outName)
        if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
        if (Test-Path $distDir)  { Remove-Item -Recurse -Force $distDir }

        $pyiArgs = @(
            '--noconfirm', '--onefile', '--windowed',
            '--name', $outName,
            '--distpath', $distDir,
            '--workpath', $buildDir,
            '--specpath', $buildDir,
            '--paths', $root,
            '--hidden-import', 'certifi',
            '--hidden-import', 'PIL',
            '--hidden-import', 'PIL.Image',
            '--hidden-import', 'PIL.ImageTk',
            '--add-data', "$appsettings;.",
            '--add-data', "$assets;assets",
            '--add-data', "$harvey;Payload",
            '--icon', $icon
        )
        if ($withKo) {
            if (-not (Test-Path $ko)) { throw "Missing KO payload for knivesout: $ko" }
            $pyiArgs += @('--add-data', "$ko;Payload")
        }
        if ($Clean) { $pyiArgs = @('--clean') + $pyiArgs }
        $pyiArgs += $entry

        & $venvPython -m PyInstaller @pyiArgs
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed for $product" }

        $built = Join-Path $distDir "$outName.exe"
        if (-not (Test-Path $built)) { throw "Expected $built not found" }
        Copy-Item $built (Join-Path $outDir "$outName.exe") -Force
        Write-Host ("  -> dist-products\{0}.exe" -f $outName) -ForegroundColor Green
    }
}
finally {
    [System.IO.File]::WriteAllText($appsettings, $originalJson, (New-Object System.Text.UTF8Encoding($false)))
    Remove-Item $backup -ErrorAction SilentlyContinue
    Write-Host 'Restored original appsettings.json.' -ForegroundColor DarkGray
}

Write-Host ("All builds in: {0}" -f $outDir) -ForegroundColor Cyan
Get-ChildItem $outDir -Filter '*.exe' | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
