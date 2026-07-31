<#
  build-all.ps1 - builds one loader EXE per product.

  Each product is the SAME code; only the embedded "Product" value in
  appsettings.json differs, which is what the server enforces. The original
  appsettings.json is always restored, even if a build fails.

  Usage (from this folder):
      powershell -ExecutionPolicy Bypass -File .\build-all.ps1
      powershell -ExecutionPolicy Bypass -File .\build-all.ps1 -Products spoofer,macro
#>
param(
    [string[]]$Products = @('spoofer', 'macro', 'knivesout'),
    [string]$Configuration = 'Release',
    [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# product id -> output exe name
$OutNames = @{
    spoofer   = 'HarvciousSpoofer'
    macro     = 'HarvciousMacro'
    knivesout = 'HarvciousKnivesOut'
}

$settingsPath = Join-Path $here 'appsettings.json'
$distDir      = Join-Path $here 'dist'
$backupPath   = Join-Path $here 'appsettings.json.bak'

if (-not (Test-Path $settingsPath)) { throw "appsettings.json not found at $settingsPath" }
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Back up the real config so we can always restore it.
Copy-Item $settingsPath $backupPath -Force
$originalJson = Get-Content $settingsPath -Raw

try {
    foreach ($product in $Products) {
        $product = $product.ToLower()
        if (-not $OutNames.ContainsKey($product)) {
            Write-Warning "Unknown product '$product' - skipping."
            continue
        }
        $outName = $OutNames[$product]
        Write-Host ("=== Building {0} ({1}) ===" -f $outName, $product) -ForegroundColor Cyan

        # Swap the Product field, keep every other setting intact.
        $cfg = $originalJson | ConvertFrom-Json
        $cfg.Product = $product
        ($cfg | ConvertTo-Json -Depth 20) | Set-Content $settingsPath -Encoding utf8

        # Publish single-file EXE with the product-specific embedded config.
        dotnet publish -c $Configuration -r $Runtime --self-contained false -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=false -p:AssemblyName=$outName
        if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed for $product" }

        $publishDir = Join-Path $here "bin\$Configuration\net8.0-windows\$Runtime\publish"
        $builtExe   = Join-Path $publishDir "$outName.exe"
        if (-not (Test-Path $builtExe)) { throw "Expected $builtExe not found" }

        Copy-Item $builtExe (Join-Path $distDir "$outName.exe") -Force
        # Ship KO.exe alongside if present (payload the loader deploys).
        $ko = Join-Path $publishDir 'KO.exe'
        if (Test-Path $ko) { Copy-Item $ko (Join-Path $distDir 'KO.exe') -Force }

        Write-Host ("  -> dist\{0}.exe" -f $outName) -ForegroundColor Green
    }
}
finally {
    # Always restore the original config.
    $originalJson | Set-Content $settingsPath -Encoding utf8
    Remove-Item $backupPath -ErrorAction SilentlyContinue
    Write-Host "Restored original appsettings.json." -ForegroundColor DarkGray
}

Write-Host ("All builds in: {0}" -f $distDir) -ForegroundColor Cyan
Get-ChildItem $distDir -Filter '*.exe' | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
