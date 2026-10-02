# Configuración remota

Manifest V3 **no permite descargar y ejecutar código**. Por eso todo lo que suele romperse cuando Amazon cambia su HTML (los **selectores**) y el formato del Excel viven en un archivo de **datos**, [`config.json`](../config.json). Todas las extensiones lo leen desde:

```
https://raw.githubusercontent.com/h3b3rt/Extension_Amazon_CF_Scrapping/main/config.json
```

Lo revisan al abrir el navegador, cada 3 horas y al abrir el popup si pasaron más de 30 minutos. Para forzarlo: **Opciones → Comprobar ahora**.

## Cambiar algo (sin publicar versión)

1. Edita `config.json`.
2. **Sube el número de `revision`** (p. ej. de 9 a 10).
3. Commit y push a `main`.

Si el archivo tiene un error, las extensiones lo **ignoran** y siguen con la última configuración válida.

## Reglas de validación

- `schemaVersion` debe ser `1`.
- `revision` debe ser **mayor o igual** que la de `config.default.json`, la copia incluida en la extensión. Si no, se usa la incluida.
- `minExtensionVersion`: las extensiones más antiguas que esa versión ignoran la configuración.
- `layouts` debe tener al menos un elemento con `id` e `item`.
- `xlsx` es obligatorio (desde la v1.6.0). `csv` ya no se usa, pero **no lo borres** todavía: las versiones 1.5.x instaladas lo exigen y, sin él, ignoran toda la configuración remota.

## Campos principales

| Campo | Para qué sirve |
|---|---|
| `latestVersion` / `downloadUrl` | Si `latestVersion` es mayor que la instalada, el popup muestra el aviso de versión nueva. |
| `notice` | Mensaje libre que aparece en el popup (p. ej. un aviso al equipo). |
| `categoriesUrl` | De dónde se descarga la lista de categorías. |
| `productUrl` | Plantilla del enlace del producto (`{asin}`). |
| `scroll.stepDelayMs` / `scroll.maxSteps` | Velocidad y límite del desplazamiento automático. |
| `image.fullSize` | Quita los modificadores de tamaño de la URL de imagen (`._AC_UL320_`). |
| `history.keepParams` | Parámetros de URL que **sí** cambian la página (`k`, `page`, `rh`…). El resto se ignora al detectar páginas repetidas. |
| `pageBrand` | Marca de toda la página en las tiendas de marca. Solo se aplica si la ruta cumple `urlPattern` (`^/stores/`). Prueba los `selectors` en orden (breadcrumb, logo), les quita `strip` (`" home page"`) y, como respaldo, busca `scriptPattern` (el `"brandName"` del JSON de la página). Se usa en `ref_marca` cuando la tarjeta no trae marca (solo referencia). |
| `price` | Selectores del precio estándar `.a-price`, ignorando el precio tachado. |
| `pageTypes[]` | Páginas especiales que usan solo sus propios layouts (ver abajo). Desde la v1.7.0. |
| `appName` | Nombre del popup fuera de los sitios disponibles (`COMPRAFACIL Scraper`). Desde la v1.8.0. |
| `sites[]` | Sitios disponibles y lo propio de cada uno (ver abajo). Desde la v1.8.0. |
| `layouts[]` | Tipos de página y cómo leer cada producto (ver abajo). |
| `xlsx` | Salida Excel: prefijo del archivo, valores fijos, condición y columnas de ayuda. |
| `csv` | Formato antiguo, solo para las versiones 1.5.x. |

## Añadir o corregir un tipo de página (`layouts`)

Cada layout describe un contenedor de producto y cómo leer sus datos. Todos los valores son **listas de selectores CSS que se prueban en orden**.

```json
{
  "id": "editorial",
  "label": "EditorialTile",
  "item": "div[data-testid=\"editorial-tile-Overlay\"][data-csa-c-item-type=\"asin\"]",
  "asinFrom": ["csaItemId", "link"],
  "link": ["a[href*=\"/dp/\"]"],
  "title": ["a[title][href*=\"/dp/\"]", "h2"],
  "brand": [],
  "image": ["[data-testid=\"editorial-tile-product-image\"] img", "img"],
  "priceWhole": ["[class*=\"Price__whole\"]"],
  "priceFraction": ["[class*=\"Price__fractional\"]"],
  "priceText": ["[data-testid=\"editorial-tile-product-price\"]"]
}
```

| Clave | Uso |
|---|---|
| `item` | Selector del contenedor de **un** producto. |
| `asinFrom` | Dónde buscar el ASIN, en orden. `attr` usa el `data-asin` del contenedor, `child` el `[data-asin]` de un hijo, `csaItemId` el `data-csa-c-item-id="amzn1.asin.XXXX"` y `link` el ASIN que aparece en el enlace `/dp/XXXX`. Desde la v1.7.0: `input` lee el valor del primer campo de `asinInput` y `url` el ASIN de la URL de la página. |
| `asinInput` | Campos con el ASIN (para `asinFrom: "input"`), p. ej. `#addToCart input#ASIN`. |
| `title` | Nombre. Si el elemento tiene atributo `title`, se usa ese; si no, su texto. |
| `brand` | Marca escrita en la tarjeta del producto. Solo va a `ref_marca`. Si no se encuentra, se usa la marca de la tienda (`pageBrand`); nunca se adivina a partir del nombre. |
| `brandPatterns` | Expresiones regulares para limpiar la marca: se usa el grupo 1 de la primera que coincide (`^Visit the (.+?) Store$` → `Apple`). Si ninguna coincide, el texto queda igual. |
| `image` | Imagen. Se elige la mayor resolución de `srcset` / `data-a-dynamic-image`. |
| `priceRoot` | Bloque donde se busca el precio (el primero que exista). Si se indica y no existe, el producto queda **sin precio**: así no se toma el precio de un accesorio o sugerencia. |
| `priceWhole` / `priceFraction` | Precio partido en entero + decimales. Es opcional; si falta, se usa el `.a-price` estándar. |
| `priceText` | Último recurso: busca `$123.45` en el texto de esos elementos. |

### Página de un producto (`pageTypes`)

```json
"pageTypes": [{
  "id": "producto",
  "label": "Página de producto",
  "urlPattern": "/(dp|gp/product|gp/aw/d)/[A-Z0-9]{10}",
  "selectors": ["#dp-container #productTitle"],
  "layouts": ["detalle"],
  "autoScroll": false
}]
```

- La página es de este tipo si la ruta cumple `urlPattern` **o** existe alguno de los `selectors`.
- En esa página solo corren los `layouts` indicados; en las demás páginas esos layouts no corren.
- `autoScroll: false` evita el desplazamiento automático, que en la página de producto solo carga sugerencias.
- El layout `detalle` usa `item: "#dp-container"` (el bloque principal del producto), el ASIN de `#addToCart input#ASIN` y el precio `.priceToPay` dentro de `#apex_desktop`.
- Las versiones 1.6.x ignoran `pageTypes` y no encuentran ASIN en `detalle` (no conocen `input`/`url`), así que en ellas no cambia nada.

**Consejos:**
- Evita las clases con hash, que cambian en cada despliegue de Amazon (`ProductGridItem__itemOuter__KUtvv`). Usa `[class*="ProductGridItem__itemOuter"]`.
- Prefiere `data-testid`, `data-asin`, `data-cy` y `data-component-type`, que son más estables.
- Un selector inválido no rompe nada: simplemente no encuentra elementos.
- En el popup, tras extraer, verás `Layout: X de Y`, es decir, cuántos productos leyó de cuántos contenedores encontró. Sirve para diagnosticar.

## Sitios (`sites`)

Desde la v1.8.0 la extensión trabaja con varios ecommerce. Cada sitio de `sites[]` **sobrescribe** las claves generales de la configuración (`layouts`, `pageTypes`, `price`, `image`, `history`, `pageBrand`, `productUrl`…) con las suyas. Si no las trae, usa las generales, que son las de **Amazon**. Por eso Amazon sigue configurado en la raíz del archivo y las versiones 1.7.x lo leen igual (ignoran `sites`).

| Clave | Uso |
|---|---|
| `id` / `name` | Identificador interno y nombre visible (`michaelkors` / `Michael Kors`). |
| `title` | Título del popup y del icono en ese sitio (`Michael Kors Product Scraper`). |
| `hosts` | Dominios del sitio; también vale cualquier subdominio (`michaelkors.com` cubre `www.michaelkors.com`). |
| `homeUrl` | Enlace que muestra el popup en la lista de sitios disponibles. |
| `ecomerce` | Valor de la columna `ecomerce`, **exactamente** como en el desplegable de la plantilla. |
| `skuPattern` | Expresión regular que debe cumplir el SKU (por defecto, ASIN de 10 caracteres). |
| `skuFromLink` | Expresión para sacar el SKU de la **ruta** del link (grupo 1). Michael Kors: `/([^/]+)\.html$`, la misma regla que usa el backend. Con esta clave el link del Excel es el enlace de donde salió el SKU. |
| `productUrl` | Plantilla del link (`https://www.amazon.com/dp/{asin}`). Vacío = usar el enlace de donde salió el SKU. |
| `groupName` | Nombre de grupo por defecto: `param` (parámetro de búsqueda, p. ej. `q`) y `strip` (expresiones que se quitan del título). |
| `image.hosts` / `image.replace` | Dominios de imagen aceptados y reemplazos en la URL (`/ECOM_Image_Medium/` → `/ECOM_Image_Large/`). |
| `history.keepParams` / `keepParamsPattern` / `productPattern` | Parámetros que identifican un listado (también por expresión, p. ej. filtros `prefn1`, `prefv1`…) y ruta de la página de producto, que se compara sin parámetros. |
| `loadMore` | Listados con botón "Load More": `item` (tarjetas que se cuentan), `button` (selectores, se usa el primero visible), `timeoutMs` (espera por clic), `delayMs`, `defaultLimit` (50) y `maxLimit` (500). `name` es el texto del botón que se muestra en el popup. Desde la v1.9.0, el límite puede ser por **páginas** (el modo inicial, 1 = solo la actual) o por productos: `maxPages` (tope de páginas por extracción, 10), `pageParam` (parámetro con el número de la página abierta: `currentPage` en Sephora, `page` en Amazon; sin él, se empieza en 1), `pageSize` (productos por página, solo para la ayuda; Michael Kors 24) y `urlPattern` (rutas donde se pide el límite; Amazon `/s`, así la tienda de marca y la portada `/b` se extraen enteras). `defaultLimit` y `maxLimit` quedan para el modo productos. En Michael Kors cada clic en "Load More" cuenta como una página. |
| `loadMore` con `mode: "scroll"` | Desde la v1.9.0 (Sephora). Listados **virtualizados**: solo se dibujan los productos cerca de la pantalla, así que se leen en cada paso del desplazamiento. Al final de la página se pulsa el botón de la página siguiente: `button` (selectores) + `buttonText` (expresión que debe cumplir su texto). Espera a que cambien la URL y el primer producto (`firstAttr`). Otras claves: `stepDelayMs` (pausa por paso), `stableSteps` (pasos sin crecer al final para darla por terminada), `maxSteps`, `maxPages`, `timeoutMs`. Si la página se recarga entera al pasar de página, la extracción se pierde y el popup lo avisa. |
| `loadMore` con `mode: "fetch"` | Desde la v1.9.0 (Amazon, en `sites[0]`). La página siguiente recarga la pestaña, así que se **descarga en segundo plano** (misma sesión) y se lee con los mismos layouts, sin navegar. `next` (selectores del enlace "Siguiente"), `delayMs` (pausa entre páginas, 1500), `maxPages` (10), `defaultLimit` (60), `maxLimit`. `item` y `urlPattern` indican en qué páginas se pide el límite. Para si una página falla o no trae productos nuevos. |
| `loadMore.json` | Desde la v1.9.0 (Sephora). Listado leído desde los datos que envía el servidor en la página, sin bajar por ella: `script` (selector del `<script>` con el JSON, `script#linkStore`), rutas `products`, `total`, `pageSize`, `page` (`*` = la primera clave donde siga la ruta, p. ej. `page.*.products`) y `fields` (ruta de cada dato: `asin`, `variante`, `link`, `nombre`, `marca`, `imagen`, `precio` como lista de rutas en orden, `excluir` para anuncios). Las páginas siguientes se piden con `pageParam`. Si la página no trae esos datos (búsquedas de Sephora), se lee al bajar (`mode: "scroll"`). |
| `loadMore` (fetch) por tramos | Desde la v1.9.0 (Michael Kors). `next` + `nextAttr` (`data-url` del botón "Load More"), y si un tramo no trae botón pero viene completo, el siguiente se arma sumando `sizeParam` a `startParam` (`start += sz`). Si el botón de la página abierta aún no existe, se busca en la copia del servidor. En los layouts, `fetchItem` es el selector de las tarjetas en un tramo descargado (sin la grilla). |
| `variant` | Desde la v1.9.0 (Sephora). Productos cuyo link debe llevar la variante: `attr` (atributo con la variante, p. ej. `data-cnstrc-item-variation-id`), `pattern`, `param` (parámetro del link, `skuId`), `origin` (dominio del link), `pathStrip` (prefijos de región que se quitan de la ruta) y `linkCheck` (expresión del backend: el grupo 1 debe ser el SKU; si no, el producto se omite). El link queda `origin + ruta + ?skuId=<variante>`, sin otros parámetros. |
| `regions` | Desde la v1.9.0. Versiones de otra región: `pathPrefix` (mismo dominio, p. ej. `/ca/en`: se abre la misma ruta sin el prefijo), `hostPattern` (otros dominios, p. ej. `sephora.fr`: se busca en EE. UU. con `searchUrl`, usando el parámetro de búsqueda de `queryParams` o el título sin `titleStrip`). En esas páginas no se extrae; el popup ofrece abrir la versión de EE. UU. |

En los layouts de un sitio, `asinFrom` admite además `canonical` (SKU del `<link rel="canonical">`), `url` (SKU de la URL de la pestaña) y `variant` (SKU del atributo `skuAttr` y link armado con `variant`); `skuAttr` cambia el atributo que lee `attr` (por defecto `data-asin`). `priceAttr` lee el precio de un atributo del producto; un rango (`107.00 - $205.00`) da el promedio. `exclude` (`{ "self", "selector", "text" }`) omite las tarjetas que cumplen `self`, o que tienen un elemento `selector` (con el texto `text`, si se indica), sin contarlas como error. Se usa para los anuncios: Sephora `.ProductTile-content > span` con `^Sponsored$`; Amazon `self: ".AdHolder"` y `.puis-sponsored-label-text`.

**Versiones anteriores y sitios nuevos:** una versión que no conoce un sitio igual lo ve en `sites` (la configuración es remota). Por eso Sephora usa `asinFrom: ["variant"]`, que la v1.8.0 no entiende: allí no extrae ningún producto, en lugar de escribir un SKU equivocado.

**Añadir un sitio nuevo** requiere versión nueva: hay que agregar su dominio a `host_permissions` en `manifest.json`. Después, sus selectores se corrigen solo con `config.json`.

## Salida Excel (`xlsx`)

El archivo se genera desde `plantilla.xlsx`, una copia de la plantilla de scraping del sistema incluida en la extensión. Las columnas se buscan **por nombre** en la fila 1, no por posición. La hoja `Mapeo_categorias` se llena con las categorías actuales.

```json
"xlsx": {
  "filenamePrefix": "Plantilla_Scraping",
  "ecomerce": "Amazon",
  "seguimiento": "Scraping",
  "condicion": { "pattern": "\\b(renewed|refurbished|reacondicionad[oa]s?)\\b", "match": "Reacondicionado", "default": "Nuevo" },
  "imageFormula": "IMAGE({celda})",
  "rowHeight": 60,
  "refColumns": [
    { "header": "ref_grupo", "field": "grupo", "width": 28 },
    { "header": "ref_imagen_link", "field": "imagen", "width": 30 },
    { "header": "ref_imagen", "imageOf": "ref_imagen_link", "width": 12 }
  ]
}
```

| Clave | Uso |
|---|---|
| `filenamePrefix` | Nombre del archivo si no se escribe uno. |
| `ecomerce` / `seguimiento` | Valores fijos de esas columnas. Desde la v1.8.0, `ecomerce` sale del sitio de cada producto (`sites[].ecomerce`); este valor queda solo para los productos de versiones anteriores. |
| `condicion` | Si el título cumple `pattern` (sin distinguir mayúsculas) se escribe `match`; si no, `default`. |
| `imageFormula` | Fórmula de la vista previa; `{celda}` se reemplaza por la celda con la URL. |
| `rowHeight` | Alto de las filas de productos, para que se vea la imagen. `0` = alto normal. |
| `skuOnlyInLink` | Desde la v1.9.0. Ecommerce cuyo SKU el sistema saca del link: en sus filas la celda `sku` no se escribe (`["Sephora"]`; es también el valor por defecto). Con `sku` lleno, el sistema perdería el ID `P…` del link. |
| `refColumns[]` | Columnas de ayuda, después de la última columna de la plantilla. `field` puede ser `imagen`, `nombre`, `marca`, `precio`, `link`, `asin`, `variante` (skuId de Sephora; desde la v1.9.0), `duplicado` o `grupo` (nombre del grupo; desde la v1.7.0, las versiones anteriores ignoran esa columna); `imageOf` crea la vista previa de otra columna. |

**Nombres prohibidos en `refColumns`:** el sistema lee estas columnas y las tomaría como datos fijos, así que la extensión las descarta aunque estén en la configuración: `ecomerce`, `sku`, `link`, `variacion`, `condicion`, `marca`, `nombre`, `categoria_general`, `codigo_categoria`, `color`, `talla`, `seguimiento`, `guia_talla`, `cantidad_imagen`, `peso`, `precio`, `stock`, `created_code`, `variant_id`, `parent_sku`, `base_sku`. Usa el prefijo `ref_`.

Si cambia la plantilla del sistema, reemplaza `plantilla.xlsx` (requiere versión nueva). Debe conservar `Plantilla` como primera hoja y las columnas `ecomerce`, `sku`, `condicion`, `link` y `seguimiento`.

## `config.default.json`

Es la copia que va **dentro** de la extensión y se usa si GitHub no responde. Al publicar una versión nueva, déjala igual que `config.json`.
