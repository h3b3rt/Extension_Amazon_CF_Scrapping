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
$files = @(Get-ChildItem $root -File | Where-Object { $_.Extension -in '.json', '.js', '.html', '.xlsx' -and $_.Name -ne 'config.json' })
# Iconos generales e iconos por sitio (icons\sitios).
$files += Get-ChildItem (Join-Path $root 'icons') -File -Filter '*.png' -Recurse

# Se arma el zip a mano porque Compress-Archive (PowerShell 5.1) guarda rutas con "\",
# y Chrome Web Store espera "/".
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  foreach ($f in $files) {
    $entry = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $entry) | Out-Null
  }
} finally {
  $archive.Dispose()
}

Write-Host "Paquete creado: $zip"
Write-Host ""
Write-Host "Siguientes pasos:"
Write-Host "  - Chrome Web Store: sube este .zip en el panel de desarrollador."
Write-Host "  - GitHub: crea la Release v$version (el workflow genera su propio .zip)."
