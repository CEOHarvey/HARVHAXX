# Lite build: small LicenseLoader.exe (~20MB or less) + KO.exe beside it.
# Requires .NET 8 Desktop Runtime on the PC (one-time install).
# Use -SelfContained for a single ~70MB exe (no separate runtime needed).
param(
    [switch]$SelfContained
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Join-Path $root "LicenseLoader\LicenseLoader.csproj"
$dll = Join-Path $root "LicenseLoader\Payload\harvey.dll"
$ko = Join-Path $root "LicenseLoader\Payload\KO.exe"

if (-not (Test-Path $dll)) {
    Write-Host "ERROR: Copy harvey.dll to LicenseLoader\Payload\harvey.dll first" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ko)) {
    Write-Host "ERROR: Copy KO.exe to LicenseLoader\Payload\KO.exe (shipped beside loader, not inside EXE)." -ForegroundColor Red
    exit 1
}

if ($SelfContained) {
    Write-Host "Publishing self-contained single-file (large ~70MB, no .NET install needed)..."
    dotnet publish $proj -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true `
        -p:SelfContained=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true
}
else {
    Write-Host "Publishing lite single-file (~20MB or less, needs .NET 8 Desktop Runtime)..."
    dotnet publish $proj -c Release -r win-x64 --self-contained false `
        -p:PublishSingleFile=true `
        -p:SelfContained=false `
        -p:EnableCompressionInSingleFile=true `
        -p:DebugType=none `
        -p:DebugSymbols=false
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Publish failed. Check build output above." -ForegroundColor Red
    exit 1
}

$pubDir = Join-Path $root "LicenseLoader\bin\Release\net8.0-windows\win-x64\publish"
$out = Join-Path $pubDir "LicenseLoader.exe"
if (-not (Test-Path $out)) {
    Write-Host "Publish failed. EXE not found at expected path." -ForegroundColor Red
    exit 1
}

Copy-Item $ko (Join-Path $pubDir "KO.exe") -Force

Write-Host ""
Write-Host "SUCCESS. Give customers these files from publish folder:" -ForegroundColor Green
Write-Host "  $out"
Write-Host "  $(Join-Path $pubDir 'KO.exe')"
Write-Host ""
$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "LicenseLoader.exe size: $sizeMb MB"
if (-not $SelfContained) {
    Write-Host ""
    Write-Host "Customers need .NET 8 Desktop Runtime:" -ForegroundColor Yellow
    Write-Host "  https://dotnet.microsoft.com/download/dotnet/8.0 (Desktop Runtime x64)"
}
