# Instalación y actualización

Guía para cualquier persona del equipo. No se necesitan conocimientos técnicos.

## Requisitos

- **Google Chrome** actualizado. Es probable que también funcione en Edge, Brave u otros navegadores Chromium, pero no se ha probado en ellos.
- Recomendado: **sesión de Chrome iniciada con tu Gmail y sincronización activada** (foto de perfil arriba a la derecha → *Activar sincronización*). Así tu historial de páginas extraídas te sigue a cualquier PC.

## Instalar por primera vez

1. Abre https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping/releases/latest
2. En **Assets**, descarga `amazon-product-scraper-X.Y.Z.zip`.
3. Descomprime el zip en una **carpeta fija**, por ejemplo `C:\Extensiones\amazon-scraper`.
   > ⚠ No borres ni muevas esa carpeta después: Chrome carga la extensión desde ahí.
4. En Chrome escribe en la barra de direcciones: `chrome://extensions`
5. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
6. Pulsa **Cargar descomprimida** y elige la carpeta del paso 3. Debe quedar la carpeta que contiene `manifest.json`.
7. Fija el icono: pulsa el puzzle 🧩 junto a la barra de direcciones y luego el pin 📌 de **Amazon Product Scraper**.

Listo. Abre cualquier búsqueda de Amazon.com y pulsa el icono naranja de la bolsa.

## Actualizar a una versión nueva

Cuando haya una versión nueva, el popup de la extensión muestra: *"Hay una nueva versión disponible: vX.Y.Z · Descargar"*.

1. Pulsa **Descargar**, o entra en el enlace de la última versión de arriba, y baja el zip nuevo.
2. Descomprímelo **encima de la misma carpeta**, reemplazando los archivos.
3. En `chrome://extensions`, pulsa el botón de recarga **↻** de la extensión.

Tu lista en curso y tu historial se conservan.

> **Alternativa con script:** desde PowerShell, en la carpeta de la extensión:
> ```powershell
> powershell -ExecutionPolicy Bypass -File tools\actualizar.ps1 -Url <enlace-del-zip>
> ```
> Luego pulsa ↻ en `chrome://extensions`.

## Lo que se actualiza solo, sin reinstalar

- **Selectores de Amazon:** si Amazon cambia su página, la corrección llega sola en unas horas. Para forzarla: **Opciones → Comprobar ahora**.
- **Categorías:** se revisan cada hora. Para forzarlas: **↻ Actualizar** en el formulario de categoría.

## Problemas frecuentes

| Problema | Solución |
|---|---|
| "Debes abrir una página de Amazon.com" | La pestaña activa debe ser de `amazon.com` (no .es, .mx, etc.). |
| "No se encontraron productos compatibles" | El resumen dice qué tipo de página encontró. Avisa al administrador con el enlace de la página: puede ser un diseño nuevo de Amazon. |
| No aparecen categorías en el buscador | Pulsa **↻ Actualizar**. Si falla, revisa tu conexión o avisa al administrador. |
| La extensión desapareció tras reiniciar | Comprueba que la carpeta sigue en su sitio y que el **Modo de desarrollador** sigue activo. |
| Chrome muestra "Desactivar extensiones en modo de desarrollador" | Es un aviso normal para extensiones instaladas desde carpeta. Pulsa la **X** (no "Desactivar"). |

## Desinstalar

En `chrome://extensions`, pulsa **Quitar** en la extensión y borra la carpeta.
