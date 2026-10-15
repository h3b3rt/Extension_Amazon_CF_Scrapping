# Historial de versiones

Cada versión se publica como GitHub Release (zip para instalar): <https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping/releases>. Las tareas abiertas están en [docs/PENDIENTES.md](docs/PENDIENTES.md).

"Probada en Chrome real" se indica solo cuando la documentación lo registra; el resto se probó en simulación (jsdom) y con capturas de un navegador sin interfaz.

## Próxima versión — en preparación

### Cambiado

- Código interno reorganizado, sin cambios de funcionamiento: los lectores de variantes de la vista previa salen de `familias.js` (`src/comun/lectores-variantes.js`, ya no se inyectan en la pestaña); la vista previa se reparte en `preview.js`, `estado.js`, `panel-variantes.js` y `acciones.js`; el scraper se parte en `lector.js` (lectura de cada producto) y `scraper.js` (flujo de la extracción).
- Pruebas: extracción sobre 39 páginas guardadas de los 5 sitios y paginación simulada, comparadas con su resultado anterior (`tests/extraccion.test.mjs`); acciones de la vista previa (`tests/vista-previa-acciones.test.mjs`).

Probado en Chrome real el 15/10/2026 (los 5 sitios, vista previa, paginación, detener y cerrar la pestaña).

## v1.14.5 — 2026-10-14

### Cambiado

- Documentación reorganizada: CHANGELOG nuevo, `docs/BACKEND.md`, PENDIENTES solo con tareas abiertas, correcciones de reglas `sku`/`link` desactualizadas.
- Limpieza de código: imports y exports sin uso, ayudas de DOM compartidas (`dom.js`: `$`, `el`, `plural`, `showStatus`), un solo `notificar` en el service worker y un solo texto de aviso de CAPTCHA (`captchaTxt`).
- Estructura de carpetas: código en `src/` (`background`, `inyectados`, `popup`, `preview`, `options`, `comun`), plantilla e iconos en `assets/`. En la raíz quedan `manifest.json`, `config.json`, `config.default.json` y `categories.json`. Sin cambios de funcionamiento. Para actualizar, borra el contenido de la carpeta y descomprime el nuevo zip en la misma carpeta (se conservan la lista, los grupos y el historial), o usa `tools\actualizar.ps1`, que quita los archivos de la estructura anterior.
- Pruebas automáticas en `tests/` (`npm test`): rutas del paquete, Excel leído como el backend, popup, vista previa y service worker.

Probada en Chrome real el 14/10/2026 (todas las funciones con la estructura nueva).

## v1.14.4 — 2026-10-14

### Corregido

- Marc Jacobs: en páginas de producto que reúnen dos modelos (p. ej. *Scene Large Bucket Bag* con los colores del *Scene Small Bucket*), al elegir un color del otro modelo la página cambia sin cambiar la URL y la extracción mezclaba el SKU y el link del modelo de la URL con el nombre, precio e imagen del otro. Ahora manda el modelo abierto (`data-product-id` del botón de favoritos) con su propio link (`selectedProductUrl` de `input#selected-express-product`, claves `linkChild`/`linkChildKey` del layout `mj-detalle`).

### Cambiado

- Columna `ecomerce` del Excel sin espacios (`MarcJacobs`, `KateSpade`, `MichaelKors`), con el desplegable de la plantilla actualizado. La vista previa muestra el nombre con espacios, salvo en *Ver datos técnicos*. El sistema lo acepta (confirmado el 14/10/2026).
- *Extraer variantes* empieza marcada en Michael Kors, Marc Jacobs y Kate Spade, con confirmación para desmarcarla. Sigue sin poder cambiarse en la vista previa.
- Vista previa: el campo del nombre del archivo tiene ancho fijo (*Se guardará como* debajo, cortado con …).
- Popup: la categoría empieza vacía (no propone la anterior ni la última usada), la lista se abre solo al escribir (o con ↓) y Enter en el campo ya no inicia la extracción (opción `soloAlEscribir` de `crearSelector`).

Probada en Chrome real el 14/10/2026.

## v1.14.3 — 2026-10-13

### Añadido

- Formato condicional de la plantilla según la regla de la v1.13.0: rojo en Amazon con `sku` vacío o `link` lleno, y en los demás sitios con `link` vacío o `sku` lleno. Validación con mensaje en `sku` y `link`.
- *Guía de tallas* se puede activar o desactivar por grupo desde la vista previa (mensaje `cambiarGuiaTalla` del service worker).

### Cambiado

- *Guía de tallas* marcada por defecto al extraer, con confirmación para desactivarla.

Probada en Chrome real el 13/10/2026.

## v1.14.2 — 2026-10-12

### Corregido

- La vista previa ya no hace parpadear las imágenes al abrir tallas o variantes (reutiliza las `<img>`).
- La vista resumida muestra los 3 primeros productos del grupo en el orden del Excel (asignar una categoría ya no los mueve).

## v1.14.1 — 2026-10-12

### Cambiado

- El popup usa el mismo selector de categoría que la vista previa (`selector-categoria.js`) en lugar de su buscador propio. *No llenar categoría* desactiva el selector; Esc cierra la lista y luego el formulario.
- README revisado.

Probada en Chrome real el 12/10/2026 (formulario de "Extraer" con el selector nuevo: buscar, por niveles, ↻ Actualizar, *No llenar categoría*).

## v1.14.0 — 2026-10-12

### Añadido

- Asignar o quitar la categoría por grupo, producto o selección desde la vista previa, con confirmación si ya tenían otra y Deshacer. El Excel sale con `Buscar categoria` y `codigo_categoria` llenos.
- Selección con casillas por producto y por grupo, *Seleccionar todos* y barra flotante (Asignar categoría, Quitar, Limpiar selección).
- Interruptor *Ver datos técnicos*: la fila del Excel como hoja de cálculo (celdas vacías con su motivo) y aparte las columnas de referencia.

### Cambiado

- Vista previa rediseñada para quien revisa el contenido: colores de COMPRAFACIL, barra superior con buscador, filtros y *Descargar Excel*; resumen con el estado en palabras; pestañas *Todos* / *Para revisar* / *No irán al Excel*; tarjetas por grupo con avisos explicados.
- Variantes cerradas al empezar, en miniaturas. Muchas tallas: resumen por color con tabla cintura × largo; más de 14 colores: *Ver los N colores*. Nombres de dimensiones de Amazon en español.
- Grupos comprimido / resumido (3 productos, por defecto) / completo.

Probada en Chrome real el 12/10/2026.

## v1.13.0 — 2026-10-09

### Añadido

- Vista previa: imagen más grande (104 px) y desplegable **▸ Ver variantes** en las familias de grupos con *Extraer variantes*.
  - Amazon: variantes de la página `/dp/` agrupadas por color, con las tallas en chips.
  - Sephora, Michael Kors, Marc Jacobs (una descarga por color) y Kate Spade: se buscan solas al abrir la vista previa, de una en una con pausa, se guardan 7 días (`storage.local.variantesLeidas`) y se suman al resumen. Siempre desde una descarga fresca de la página del producto.
  - Colores y tamaños de otro modelo (Michael Kors, Marc Jacobs) no cuentan como variantes; la celda dice cuáles son. Marc Jacobs muestra el nombre del tamaño ("LARGE" en vez de "1SZ").
  - Kate Spade de un solo color: color e imagen del `ProductGroup`.
  - Lo extraído antes se carga con **Cargar variantes**.

### Cambiado

- Excel: solo Amazon lleva `sku` (el ASIN), sin `link` (`xlsx.linkOmit`, nuevo). Sephora, Michael Kors, Marc Jacobs y Kate Spade llevan `link` sin `sku` (`xlsx.skuOnlyInLink`). Regla confirmada por el encargado del bot de scraping el 09/10/2026.

### Permisos

- `unlimitedStorage` (sin aviso al usuario): las variantes guardadas podían superar el límite de 10 MB de `storage.local`.

Probada en Chrome real: variantes de Amazon, Michael Kors, Kate Spade y tonos de Sephora (09/10/2026), Marc Jacobs (12/10/2026). Amazon con y sin variantes confirmado en el sistema el 12/10/2026; Michael Kors, Sephora, Marc Jacobs y Kate Spade (solo `link`), el 14/10/2026.

## v1.12.1 — 2026-10-07

### Corregido

- Sephora: las páginas de producto de un solo SKU (sin tonos ni tamaños, p. ej. calendarios de adviento) no extraían nada porque no traen `data-cnstrc-item-variation-id`. Ahora el `skuId` se lee de "Item 3031002" (`variantChild`).

## v1.12.0 — 2026-10-06

### Añadido

- Icono por sitio: el favicon de cada sitio en un marco naranja, en la barra (por pestaña) y en el popup. Fuera de un sitio vuelve la bolsa naranja.
- **Vista previa** del Excel en una pestaña: las mismas filas que el archivo (`filasExcel`), avisos, columna *Familia*, filtros, sección *No irán al Excel*, descarga desde la pestaña y actualización sola.
- Quitar productos desde la vista previa: 🗑, selección múltiple, pregunta *Quitar solo este* / *Quitar la familia completa* y Deshacer. Bloqueado mientras se exporta. Los quitados no se recuerdan.

Probada en Chrome real el 06/10/2026 (icono por sitio y vista previa con los 5 sitios).

## v1.11.0 — 2026-10-06

### Añadido

- Kate Spade (solo `www.katespade.com`, sin el outlet `surprise.katespade.com`): categorías, filtros, búsquedas y página de producto. SKU = estilo sin color (`KD120-960` → `KD120`), escrito como texto.
- Un producto por familia siempre: la familia sale del JSON-LD (`ProductGroup`) de la página de cada producto, con pausas como en Amazon.
- Scroll infinito: páginas siguientes descargadas en segundo plano (`?page=N&startFrom=N`, con vuelta a `?page=N`); límite solo por productos.
- Imagen armada desde el link si la tarjeta no la cargó; precio menor en un rango; botón a EE. UU. desde otra región.

### Cambiado

- Familias generalizadas a cualquier sitio (`familias.js`, verificación al exportar por sitio).

### Permisos

- `www.katespade.com`.

Probada en Chrome real el 06/10/2026. Confirmado en el sistema (un producto por estilo con `asin` vacío) el 14/10/2026.

## v1.10.1 — 2026-10-03

### Añadido

- Amazon: un producto por familia (`parentAsin`/`dimensionToAsinMap` de la página `/dp/`, pausa de 1,5 a 3 s entre descargas). Con límite por productos cuenta familias y pregunta *Seguir / Detener* en el popup y en una notificación. Sin familia: se conserva con *Familia sin verificar* y se vuelve a verificar al exportar.
- Opciones del grupo *Extraer variantes* y *Guía de tallas* (`variacion`/`guia_talla` = Sí/No), fijas desde la extracción. Sin variantes no se verifican familias.
- Duración de la extracción en el resumen y la notificación, sin contar esperas.

### Cambiado

- Plantilla reordenada: `variacion` y `guia_talla` junto a las obligatorias, `ref_*` después de `seguimiento` y las columnas que llena el bot al final.

Probada en Chrome real el 03/10/2026 (tienda Sidagar: 10 productos de 25, todos de familias distintas). Confirmado en el sistema el 14/10/2026 que cada familia se crea una sola vez; también `variacion = No` (solo ese ASIN) y `guia_talla = Sí`.

## v1.10.0 — 2026-10-02

### Añadido

- Marc Jacobs (solo `/us-en/`): categorías, filtros, búsqueda como página y página de producto.
- SKU = modelo base, como `normalizeSku` del backend (corta en el primer "-"): una fila por modelo con el primer color; se omiten los SKU de más de 15 caracteres.
- Scroll infinito leído en segundo plano (tramos de `Search-UpdateGrid`); límite solo por productos.
- Búsqueda abierta en el panel: botón para abrirla como página (`/us-en/search?q=…`).
- Otra región: no se extrae; botón a `/us-en/homepage`.

### Cambiado

- La v1.9.0 no extrae nada en Marc Jacobs (fuentes de SKU nuevas).

Probada en Chrome real el 02/10/2026 (categoría con tramos, filtro, búsqueda como página, producto, otra región).

## v1.9.0 — 2026-10-02

### Añadido

- Sephora: categorías y marcas leídas de los datos de la página (60 por página, sin anuncios); búsquedas leídas al bajar, con pausa si la pestaña se oculta. Link limpio `…-P<ID>?skuId=<SKU>` validado con la regla del backend (`parseSephoraUrl`), `sku` vacía, una fila por producto, anuncios omitidos, columna `ref_sku_id`. Otras regiones: botón a la versión de EE. UU.
- Límite por páginas (por defecto 1 = solo la actual, máximo 10) o por productos, recordado por sitio.
- Extracciones en el service worker: siguen con el popup cerrado, se ponen en cola, avisan con notificación e icono, se pueden detener y guardan lo leído si se cierra la pestaña.
- Lista: resumen desplegable ▸ y 🗑 por grupo (también lo borra del historial).

### Cambiado

- Amazon: anuncios (Patrocinado) omitidos, páginas siguientes descargadas en segundo plano, portadas de categoría `/b?node=` y tiendas con prefijo `/-/es/`.
- Michael Kors: tramos de "Load More" descargados en segundo plano.
- Al actualizar, el límite de productos guardado no se usa: el popup empieza en **Páginas = 1**.

### Permisos

- `sephora.com` y `notifications`.

Probada en Chrome real el 02/10/2026 (Sephora, segundo plano, límite por páginas, Amazon con varias páginas). Tiendas de marca de Amazon (`/stores/…`) probadas el 12/10/2026 (no se confirmó si usaban tarjetas `EditorialTile`). Sephora confirmado en el sistema (`skuId` y `P…` del link) el 14/10/2026.

## v1.8.0 — 2026-10-01

### Añadido

- Varios sitios (`sites.js` + `config.sites`): cada sitio define dominio, ecomerce, selectores, regla del SKU, historial y Load More. Amazon sigue en la raíz de `config.json`, así que las 1.7.x no cambian.
- Michael Kors: listados y páginas de producto. SKU tomado del link `/<ID>.html` con la misma regla que el backend (`parseMkUrl`).
- "Máximo de productos" en listados con Load More (50 por defecto, recordado por sitio, avance en vivo en el popup).

### Cambiado

- La extensión se llama **COMPRAFACIL Scraper**. El popup y el icono muestran el nombre del sitio; en otras páginas, la lista de sitios.
- Lista y Excel con varios sitios: `ecomerce` por producto, clave `sitio:SKU` fuera de Amazon.

### Permisos

- `michaelkors.com`.

Probada en Chrome real el 01/10/2026 (Michael Kors con Load More y páginas de producto). Confirmado en el sistema (SKU del link) el 14/10/2026.

## v1.7.0 — 2026-10-01

### Añadido

- Página de producto (`/dp/`, `/gp/product/`, `/gp/aw/d/`): solo ese producto (layout `detalle`), sin sugerencias ni carruseles.
- Grupos con nombre: cada "Extraer" crea un grupo, que se renombra con doble clic y enlaza a la página original. Un ASIN extraído de nuevo pasa al último grupo. Columna `ref_grupo` y filas ordenadas por grupo.

### Cambiado

- Historial: las URL de producto se normalizan a `/dp/ASIN`.
- "Múltiples categorías" pasa a llamarse "No llenar categoría".

Probada en Chrome real el 01/10/2026 (búsquedas, página de producto y grupos en el popup).

## v1.6.0 — 2026-10-01

### Añadido

- Salida en la plantilla de scraping del sistema (.xlsx, desde `plantilla.xlsx`, sin librerías): `ecomerce`, `sku`, `condicion`, `link`, categoría (fórmula + valor) y `seguimiento`, más la hoja `Mapeo_categorias`.
- Columnas de ayuda `ref_*` con vista previa `=IMAGE()` y aviso de posibles variantes; marca de la tienda solo como referencia en `ref_marca`.

### Cambiado

- Se elimina la exportación CSV (`config.json` conserva `csv` para las 1.5.x).
- No se escriben celdas vacías ni columnas que el backend toma como valores fijos.

Excel revisado en Google Sheets y subida de prueba al sistema confirmada (productos creados con su categoría y condición).

## v1.5.2 — 2026-09-30

### Añadido

- Categoría "Por niveles" (principal → secundaria → terciaria), sincronizada con el buscador; se recuerda el modo usado.

### Cambiado

- Workflow de categorías: inicia sesión con los secrets `CF_EMAIL`/`CF_PASSWORD` y usa el JWT de sesión (ya no `API_TOKEN`). Funciona desde el 30/09/2026, cada 3 horas.

### Corregido

- Elementos ocultos que se mostraban por estilos (niveles en modo Buscar, botones al pedir el nombre del CSV).

Buscador de categorías, modo Por niveles y ↻ Actualizar probados en Chrome real (registrado el 01/10/2026).

## v1.5.1 — 2026-09-29

### Cambiado

- "Múltiples categorías" empieza siempre desmarcada, también al reemplazar una página extraída antes sin categoría.

## v1.5.0 — 2026-09-29

### Añadido

- Workflow "Actualizar categorías": consulta la API cada 3 horas y actualiza `categories.json` si hubo cambios. La extensión lee `categories.json` de GitHub, con copia incluida como respaldo.
- Botón **↻ Actualizar** y buscador propio (filtra al escribir, rutas con "/", teclado, recientes).
- Historial personal sincronizado con la cuenta de Google (`chrome.storage.sync`, hasta 150 páginas).

### Cambiado

- Popup más ancho (420 px). Se retira el token por PC.

## v1.4.0 — 2026-09-29

### Añadido

- Categorías del sistema COMPRAFACIL desde la API, por ruta o por código, con validación contra la lista oficial y caché diaria.
- Columnas CATEGORIA SECUNDARIA y CATEGORIA TERCIARIA.

## v1.3.1 — 2026-09-29

### Cambiado

- "Desplazar la página" y "Acumular varias páginas" activadas por defecto; pasan del popup a Opciones → Extracción.

## v1.3.0 — 2026-09-29

### Añadido

- Historial de páginas extraídas: avisa si la página ya se extrajo y ofrece reemplazar los datos; historial completo en Opciones.
- Nombre de archivo opcional y panel con las páginas agregadas y su categoría.

## v1.2.0 — 2026-09-29

### Añadido

- Categoría principal antes de cada extracción (con sugerencias recientes) y opción "Múltiples categorías".
- Columnas CATEGORIA PRINCIPAL y COD CATEGORIA en el CSV.
- Grilla `EditorialTile` de tiendas de marca de Amazon.
- Icono de la extensión y nombre de archivo `Plantilla_Scrapping_<fecha>_<hora>.csv`.

## v1.1.0 — 2026-09-29

- Versión inicial (*Amazon Product Scraper*, exportación CSV). Sin tag.
