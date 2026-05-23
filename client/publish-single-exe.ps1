# Builds ONE exe you can copy to any folder (includes .NET runtime on customer PC)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Join-Path $root "LicenseLoader\LicenseLoader.csproj"
$payload = Join-Path $root "LicenseLoader\Payload\harvey.dll"

if (-not (Test-Path $payload)) {
    Write-Host "ERROR: Copy harvey.dll to LicenseLoader\Payload\harvey.dll first" -ForegroundColor Red
    exit 1
}

Write-Host "Publishing single-file EXE (win-x64, self-contained)..."
dotnet publish $proj -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true

if ($LASTEXITCODE -ne 0) {
    Write-Host "Publish failed. Check build output above." -ForegroundColor Red
    exit 1
}

$out = Join-Path $root "LicenseLoader\bin\Release\net8.0-windows\win-x64\publish\LicenseLoader.exe"
if (Test-Path $out) {
    Write-Host ""
    Write-Host "SUCCESS. Give customers ONLY this file:" -ForegroundColor Green
    Write-Host $out
    Write-Host ""
    $sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
    Write-Host "Size: $sizeMb MB"
} else {
    Write-Host "Publish failed. EXE not found at expected path." -ForegroundColor Red
    exit 1
}
