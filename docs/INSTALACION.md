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
7. Fija el icono: pulsa el puzzle 🧩 junto a la barra de direcciones y luego el pin 📌 de **COMPRAFACIL Scraper** (hasta la v1.7.0 se llamaba *Amazon Product Scraper*).

Listo. Abre una búsqueda de Amazon.com, Michael Kors, Sephora o Marc Jacobs y pulsa el icono naranja de la bolsa.

## Actualizar a una versión nueva

Cuando haya una versión nueva, el popup de la extensión muestra: *"Hay una nueva versión disponible: vX.Y.Z · Descargar"*.

1. Pulsa **Descargar**, o entra en el enlace de la última versión de arriba, y baja el zip nuevo.
2. Descomprímelo **encima de la misma carpeta**, reemplazando los archivos.
3. En `chrome://extensions`, pulsa el botón de recarga **↻** de la extensión.

Tu lista en curso y tu historial se conservan.

> **v1.8.0:** la extensión cambia de nombre a **COMPRAFACIL Scraper** y pide permiso para `michaelkors.com`. Si Chrome muestra un aviso de permisos nuevos, acéptalo.
>
> **v1.9.0:** pide permiso para `sephora.com` y para mostrar **notificaciones** (aviso al terminar una extracción). Si Chrome muestra un aviso de permisos nuevos, acéptalo. El límite de productos que tenías guardado no se usa: el popup empieza en **Páginas = 1**.

> **Alternativa con script:** desde PowerShell, en la carpeta de la extensión:
> ```powershell
> powershell -ExecutionPolicy Bypass -File tools\actualizar.ps1 -Url <enlace-del-zip>
> ```
> Luego pulsa ↻ en `chrome://extensions`.

## Lo que se actualiza solo, sin reinstalar

- **Selectores de cada sitio:** si Amazon, Michael Kors, Sephora o Marc Jacobs cambian su página, la corrección llega sola en unas horas. Para forzarla: **Opciones → Comprobar ahora**.
- **Categorías:** se revisan cada hora. Para forzarlas: **↻ Actualizar** en el formulario de categoría.

## Problemas frecuentes

| Problema | Solución |
|---|---|
| "Abre una página de un sitio disponible" | La pestaña activa debe ser de `amazon.com` (no .es, .mx, etc.) , de `michaelkors.com`, de `sephora.com` o de `marcjacobs.com/us-en/`. El popup muestra los sitios disponibles con su enlace. En una Sephora de otra región ofrece abrir la versión de EE. UU. |
| "No se encontraron productos compatibles" | El resumen dice qué tipo de página encontró. Avisa al administrador con el enlace de la página: puede ser un diseño nuevo del sitio. |
| "Load More dejó de responder" | El botón de Michael Kors no cargó más productos en 15 segundos (conexión lenta o fin de la lista). Se extrae lo cargado; vuelve a intentar con **Reemplazar datos anteriores** si faltan productos. |
| "Show More Products no cargó la página siguiente" / "La página cambió o se recargó durante la carga" | Sephora no pasó de página, o la recargó entera. En el primer caso se extrae lo leído; en el segundo no se guarda nada. Vuelve a intentar, o extrae cada página (`?currentPage=2`, `3`…) por separado con **Páginas = 1**. Mientras trabaja, no toques la página. |
| No aparecen categorías en el buscador | Pulsa **↻ Actualizar**. Si falla, revisa tu conexión o avisa al administrador. |
| La extensión desapareció tras reiniciar | Comprueba que la carpeta sigue en su sitio y que el **Modo de desarrollador** sigue activo. |
| Chrome muestra "Desactivar extensiones en modo de desarrollador" | Es un aviso normal para extensiones instaladas desde carpeta. Pulsa la **X** (no "Desactivar"). |

## Desinstalar

En `chrome://extensions`, pulsa **Quitar** en la extensión y borra la carpeta.
