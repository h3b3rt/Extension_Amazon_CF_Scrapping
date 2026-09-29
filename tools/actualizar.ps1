# Actualiza una instalación "descomprimida" (modo desarrollador) desde un .zip remoto.
# Uso: powershell -ExecutionPolicy Bypass -File tools\actualizar.ps1 -Url https://tu-dominio.com/scraper/amazon-product-scraper-1.2.0.zip
# Después pulsa "Recargar extensión" en Opciones (o el botón de recarga en chrome://extensions).

param([Parameter(Mandatory = $true)][string]$Url)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP "amazon-scraper-update.zip"

Write-Host "Descargando $Url ..."
Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing

Expand-Archive -Path $tmp -DestinationPath $root -Force
Remove-Item $tmp -Confirm:$false

$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host "Archivos actualizados a la versión $version. Recarga la extensión en Chrome."
