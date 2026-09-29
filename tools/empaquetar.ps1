# Genera dist\amazon-product-scraper-<version>.zip listo para publicar.
# Uso: powershell -ExecutionPolicy Bypass -File tools\empaquetar.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "amazon-product-scraper-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Confirm:$false }

# config.json es la configuración remota (se sirve desde GitHub), no va en el paquete.
$files = Get-ChildItem $root -File | Where-Object { $_.Extension -in '.json', '.js', '.html', '.png' -and $_.Name -ne 'config.json' }
Compress-Archive -Path $files.FullName -DestinationPath $zip

Write-Host "Paquete creado: $zip"
Write-Host ""
Write-Host "Siguientes pasos:"
Write-Host "  1. Sube el .zip a tu servidor (o a Chrome Web Store)."
Write-Host "  2. En el config.json remoto actualiza: latestVersion = `"$version`" y downloadUrl = <URL del .zip>."
