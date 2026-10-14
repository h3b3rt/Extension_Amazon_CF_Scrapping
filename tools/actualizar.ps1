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

# Desde la v1.14.5 el código está en src\ y los recursos en assets\. Expand-Archive no
# borra lo que ya no viene en el .zip: se quitan los archivos de la estructura anterior,
# que ya no se usan, para no confundirlos con los nuevos.
if (Test-Path (Join-Path $root 'src\background\background.js')) {
  $anteriores = @('background.js', 'scraper.js', 'familias.js', 'popup.html', 'popup.js', 'preview.html', 'preview.js',
    'options.html', 'options.js', 'config.js', 'sites.js', 'groups.js', 'history.js', 'categories.js', 'prefs.js',
    'export.js', 'xlsx.js', 'descarga.js', 'selector-categoria.js', 'dom.js', 'jobs.js', 'plantilla.xlsx', 'icons')
  foreach ($a in $anteriores) {
    $p = Join-Path $root $a
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -Confirm:$false }
  }
}

$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host "Archivos actualizados a la versión $version. Recarga la extensión en Chrome."
