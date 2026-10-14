# Cómo lee el backend el Excel

El backend (la carga de la plantilla de scraping y el bot de scraping) **no se cambia**. La relación es de un solo sentido: la extensión se adapta a lo que el backend hace hoy, incluidas sus rarezas. No se proponen cambios al backend, ni siquiera arreglos pequeños de una expresión regular.

## Regla actual (desde la v1.13.0)

Confirmada por el responsable del bot de scraping el 09/10/2026:

| Ecommerce | Celda `sku` | Celda `link` |
|---|---|---|
| Amazon | Siempre (el ASIN) | **No se escribe** |
| Sephora, Michael Kors, Marc Jacobs, Kate Spade | **No se escribe** | Siempre: el bot saca el SKU del link |

- Lo controlan dos claves de la configuración remota: `xlsx.skuOnlyInLink` (ecommerce cuyas filas van sin `sku`) y `xlsx.linkOmit` (ecommerce cuyas filas van sin `link`). Ver [CONFIGURACION-REMOTA.md](CONFIGURACION-REMOTA.md#salida-excel-xlsx).
- Desde la v1.14.4 la celda `ecomerce` va **sin espacios**, como en el desplegable de la plantilla: `Amazon`, `Sephora`, `MichaelKors`, `MarcJacobs`, `KateSpade`. Lo hace `filasExcel` en `xlsx.js`. En el resto de la extensión (productos guardados, `sites[].ecomerce`, `skuOnlyInLink`, `linkOmit`, vista previa salvo la tabla técnica) se sigue usando el nombre con espacios.

## Reglas generales de la carga

- El backend lee la **primera hoja** con `XLSX.utils.sheet_to_json` **sin opciones**: las columnas se buscan por el **nombre** de la cabecera, no por su posición.
- **Nunca escribir celdas vacías.** Un `''` rompe los valores por defecto del backend (`??`), y una fila con `sku` vacío (en Amazon) se descarta sin aviso. Si no hay dato, la celda no se escribe.
- **Nunca llenar columnas del backend** que la extensión no debe decidir (`marca`, `nombre`, `precio`, `peso`…): el sistema las tomaría como valores fijos. La lista completa de nombres prohibidos está en [CONFIGURACION-REMOTA.md](CONFIGURACION-REMOTA.md#salida-excel-xlsx).
- Las columnas de ayuda llevan el prefijo **`ref_`** (`ref_grupo`, `ref_imagen`…); el backend las ignora.
- Un SKU se escribe siempre como **texto** (`inlineStr`), nunca como número.

## Sephora: reglas del link

Las reglas vienen de `parseSephoraUrl` y siguen explicando cómo se arma el link:

- SKU = parámetro `skuId` del link. Un link **sin `skuId`** se descarta sin aviso.
- `product_id` = la **primera** coincidencia de `-([A-Z]\d+)` en la ruta. Debe ser el id `-P<dígitos>` (`P123456`); si antes aparece otro trozo que cumpla la expresión (p. ej. `-v2-`), se tomaría ese. La extensión solo envía links cuya primera coincidencia es el `-P…`.
- El procedimiento del backend deduplica **solo por sku**: dos `skuId` de un mismo producto crearían dos productos. Por eso la extensión deduplica por el id `P…` y envía **una fila por producto**, con el `skuId` por defecto del listado.
- El link se arma limpio: origen + ruta + `?skuId=<variante>`, sin otros parámetros (`config.variant`). No se confía en el canonical ni en `script#linkStore` de la pestaña: tras navegar dentro del sitio pueden ser de la página anterior.
- `variacion`, `color` y `talla` pueden quedar vacíos (= producto simple). `tipo_sku` no se lee.

## Michael Kors

El SKU es el id de la ruta del link, `/<ID>.html` (misma regla que `parseMkUrl` del backend; en la configuración, `skuFromLink`).

## Histórico (anterior a v1.13.0)

> **Ya no se aplica.** Desde la v1.13.0 Marc Jacobs y Kate Spade van con `link` y sin `sku`. Se deja porque explica decisiones que siguen en el código (el SKU como estilo base y una fila por estilo).

Con el comportamiento anterior de `product.controller.ts`, en Marc Jacobs y Kate Spade el link se ignoraba y todo salía de la celda `sku`, que debía ir siempre llena:

- `normalizeSku`: si el valor no es texto da `null`; si lo es, quita espacios, corta en el primer `-`, pasa a mayúsculas y quita todo lo que no sea `A-Z0-9`. El resultado iba a `sku`, `product_id`, `asin` (Kate Spade: `asin = null`), `variant_id`, `parent_sku` y `base_sku`.
- Se descartaban sin aviso:
  - `sku` vacío, ausente o `''`;
  - `sku` escrito como número (por eso se escribe como texto, `inlineStr`);
  - un valor que normaliza a `''` (empieza con `-` o solo tiene símbolos);
  - un sku que ya existe en `productos.sku` o `alt_sku` (solo inserta);
  - filas repetidas en el archivo (el procedimiento deduplica por `LOWER(TRIM(sku))` y no se sabe cuál fila queda).
- `product_id` es `VARCHAR(15)`: un sku más largo podría romper todo el lote (no verificado), así que se omitía.
- Los colores de un estilo (`H001M01SP21-001`, `-650`) se juntan en un solo producto, así que la extensión deduplica por el estilo base normalizado (`skuBase` en la configuración).

## Añadir un ecommerce

Antes de escribir selectores, preguntar cómo lo lee el backend: qué parte del link o qué columna se vuelve `sku`/`product_id`, qué hace que el procedimiento descarte una fila y cómo deduplica. Anotarlo en este archivo y adaptar el link y la celda `sku` a esa respuesta.
