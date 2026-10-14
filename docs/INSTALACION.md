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
7. Fija el icono: pulsa el puzzle 🧩 junto a la barra de direcciones y luego el pin 📌 de **COMPRAFACIL Scraper**.

Listo. Abre una búsqueda de Amazon.com, Michael Kors, Sephora, Marc Jacobs o Kate Spade y pulsa el icono de la extensión. En un sitio disponible, el icono muestra el logo de ese sitio dentro de un marco naranja; en cualquier otra página, la bolsa naranja.

## Actualizar a una versión nueva

Cuando haya una versión nueva, el popup de la extensión muestra: *"Hay una nueva versión disponible: vX.Y.Z · Descargar"*.

1. Pulsa **Descargar**, o entra en el enlace de la última versión de arriba, y baja el zip nuevo.
2. Descomprímelo **encima de la misma carpeta**, reemplazando los archivos.
3. En `chrome://extensions`, pulsa el botón de recarga **↻** de la extensión.

Tu lista en curso y tu historial se conservan.

> **Permisos:** la extensión pide acceso a `amazon.com`, `michaelkors.com`, `sephora.com`, `marcjacobs.com` y `www.katespade.com` (para leer sus páginas), a `raw.githubusercontent.com` (configuración y categorías), a mostrar **notificaciones** (aviso al terminar una extracción) y a las **descargas** (el Excel). Si al actualizar Chrome muestra un aviso de permisos nuevos, acéptalo. Qué cambió en cada versión: [historial de versiones](../CHANGELOG.md).

> **Alternativa con script:** desde PowerShell, en la carpeta de la extensión:
> ```powershell
> powershell -ExecutionPolicy Bypass -File tools\actualizar.ps1 -Url <enlace-del-zip>
> ```
> Luego pulsa ↻ en `chrome://extensions`.

## Lo que se actualiza solo, sin reinstalar

- **Selectores de cada sitio:** si Amazon, Michael Kors, Sephora, Marc Jacobs o Kate Spade cambian su página, la corrección llega sola en unas horas. Para forzarla: **Opciones → Comprobar ahora**.
- **Categorías:** se revisan cada hora. Para forzarlas: **↻ Actualizar** en el formulario de categoría.

## Problemas frecuentes

| Problema | Solución |
|---|---|
| "Abre una página de un sitio disponible" | La pestaña activa debe ser de `amazon.com` (no .es, .mx, etc.) , de `michaelkors.com`, de `sephora.com`, de `marcjacobs.com/us-en/` o de `www.katespade.com` (el outlet `surprise.katespade.com` no). El popup muestra los sitios disponibles con su enlace. En una Sephora, Marc Jacobs o Kate Spade de otra región ofrece abrir la versión de EE. UU. |
| "Kate Spade bloqueó las descargas" | Kate Spade dejó de responder a las descargas de las páginas de producto (*Access Denied*). Se guarda lo leído, con *Familia sin verificar* en los que faltan. Espera unos minutos y descarga el Excel: esos productos se verifican antes. |
| "No se encontraron productos compatibles" | El resumen dice qué tipo de página encontró. Avisa al administrador con el enlace de la página: puede ser un diseño nuevo del sitio. |
| "No se pudo cargar la página N" / "La página N no trajo productos nuevos" | La página siguiente no se pudo descargar (conexión, o el sitio pidió verificar que no eres un robot) o ya no había más productos. Se extrae lo leído y el resumen lo avisa. Si faltan productos, resuelve la verificación en el sitio y vuelve a intentar con **Reemplazar datos anteriores**. |
| "Show More Products no cargó la página siguiente" / "La pestaña cambió de página o se recargó" | En una búsqueda de Sephora, la página no avanzó, o la pestaña se recargó o cambió de página durante la extracción. En ambos casos se guarda lo leído hasta ese momento. Si faltan productos, vuelve a intentar o extrae cada página (`?currentPage=2`, `3`…) por separado con **Páginas = 1**. Mientras trabaja, no toques la página. |
| No aparecen categorías en el buscador | Pulsa **↻ Actualizar**. Si falla, revisa tu conexión o avisa al administrador. |
| La extensión desapareció tras reiniciar | Comprueba que la carpeta sigue en su sitio y que el **Modo de desarrollador** sigue activo. |
| Chrome muestra "Desactivar extensiones en modo de desarrollador" | Es un aviso normal para extensiones instaladas desde carpeta. Pulsa la **X** (no "Desactivar"). |

## Desinstalar

En `chrome://extensions`, pulsa **Quitar** en la extensión y borra la carpeta.
