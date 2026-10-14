# Configuración remota

Manifest V3 **no permite descargar y ejecutar código**. Por eso todo lo que suele romperse cuando un sitio cambia su HTML (los **selectores**) y el formato del Excel viven en un archivo de **datos**, [`config.json`](../config.json). Todas las extensiones lo leen desde:

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
- `xlsx` es obligatorio.

## Claves que se conservan por las versiones antiguas

- **`csv`:** formato antiguo que ya no se usa, pero **no lo borres**: las versiones 1.5.x instaladas lo exigen y, sin él, ignoran toda la configuración remota.
- **Amazon en la raíz:** las claves generales (`layouts`, `pageTypes`, `price`, `image`, `history`, `pageBrand`, `productUrl`…) son las de Amazon, porque las versiones 1.7.x ignoran `sites` y solo leen la raíz. Ver [Sitios](#sitios-sites).

## Campos principales

| Campo | Para qué sirve |
|---|---|
| `revision` / `updatedAt` | Número de la configuración (ver arriba) y fecha de la última edición. Opciones muestra los dos (`revision (updatedAt)`). |
| `remoteConfigUrl` | Solo cuenta el de `config.default.json`: es la URL inicial de la configuración remota. En **Opciones** se puede cambiar por otra (se guarda en `storage.local.settings.configUrl`). |
| `latestVersion` / `downloadUrl` | Si `latestVersion` es mayor que la instalada, el popup muestra el aviso de versión nueva. |
| `notice` | Mensaje libre que aparece en el popup (p. ej. un aviso al equipo). |
| `categoriesUrl` | De dónde se descarga la lista de categorías. |
| `productUrl` | Plantilla del enlace del producto (`{asin}`). |
| `scroll.stepDelayMs` / `scroll.maxSteps` | Velocidad y límite del desplazamiento automático. |
| `image.fullSize` | Quita los modificadores de tamaño de la URL de imagen (`._AC_UL320_`). |
| `history.keepParams` | Parámetros de URL que **sí** cambian la página (`k`, `page`, `rh`…). El resto se ignora al detectar páginas repetidas. |
| `pageBrand` | Marca de toda la página en las tiendas de marca (ver abajo). |
| `price` | Selectores del precio estándar `.a-price`, ignorando el precio tachado. |
| `pageTypes[]` | Páginas especiales que usan solo sus propios layouts (ver abajo). |
| `appName` | Nombre del popup fuera de los sitios disponibles (`COMPRAFACIL Scraper`). |
| `sites[]` | Sitios disponibles y lo propio de cada uno (ver abajo). |
| `layouts[]` | Tipos de página y cómo leer cada producto (ver abajo). |
| `xlsx` | Salida Excel: prefijo del archivo, valores fijos, condición y columnas de ayuda. |
| `csv` | Formato antiguo, solo para las versiones 1.5.x. |

**`pageBrand`:** solo se aplica si la ruta cumple `urlPattern` (`^/stores/`). Prueba los `selectors` en orden (breadcrumb, logo), les quita `strip` (`" home page"`) y, como respaldo, busca `scriptPattern` (el `"brandName"` del JSON de la página). Se usa en `ref_marca` cuando la tarjeta no trae marca (solo referencia).

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

### Datos del producto

| Clave | Uso |
|---|---|
| `item` | Selector del contenedor de **un** producto. |
| `fetchItem` | Selector de las tarjetas en un tramo descargado (sin la grilla), para `loadMore` por tramos. |
| `asinFrom` | Dónde buscar el SKU, en orden (ver la tabla siguiente). |
| `asinInput` | Campos con el ASIN (para `asinFrom: "input"`), p. ej. `#addToCart input#ASIN`. |
| `title` | Nombre. Si el elemento tiene atributo `title`, se usa ese; si no, su texto. |
| `brand` | Marca escrita en la tarjeta del producto. Solo va a `ref_marca`. Si no se encuentra, se usa la marca de la tienda (`pageBrand`) o `brandDefault`; nunca se adivina a partir del nombre. |
| `brandPatterns` | Expresiones regulares para limpiar la marca: se usa el grupo 1 de la primera que coincide (`^Visit the (.+?) Store$` → `Apple`). Si ninguna coincide, el texto queda igual. |
| `image` | Imagen. Se elige la mayor resolución de `srcset` / `data-a-dynamic-image`. |
| `exclude` | `{ "self", "selector", "text" }`: omite las tarjetas que cumplen `self`, o que tienen un elemento `selector` (con el texto `text`, si se indica), sin contarlas como error. Se usa para los anuncios: Sephora `.ProductTile-content > span` con `^Sponsored$`; Amazon `self: ".AdHolder"` y `.puis-sponsored-label-text`. |

### Precio

| Clave | Uso |
|---|---|
| `priceRoot` | Bloque donde se busca el precio (el primero que exista). Si se indica y no existe, el producto queda **sin precio**: así no se toma el precio de un accesorio o sugerencia. |
| `priceWhole` / `priceFraction` | Precio partido en entero + decimales. Es opcional; si falta, se usa el `.a-price` estándar. |
| `priceContent` | Lee el precio del atributo `content` de esos selectores (Marc Jacobs: `.price > span[content]:not(.price-strike)`, el de venta y no el tachado). |
| `priceAttr` | Lee el precio de un atributo del producto; un rango (`107.00 - $205.00`) da el promedio. |
| `priceText` | Último recurso: busca `$123.45` en el texto de esos elementos. |

### Fuentes del SKU (`asinFrom`)

| Fuente | De dónde sale el SKU |
|---|---|
| `attr` | Atributo del contenedor: `skuAttr` (por defecto `data-asin`). |
| `child` | `[data-asin]` de un hijo. |
| `csaItemId` | `data-csa-c-item-id="amzn1.asin.XXXX"`. |
| `link` | El ASIN del enlace `/dp/XXXX` (o `skuFromLink` del sitio). |
| `input` | Valor del primer campo de `asinInput`. |
| `url` | SKU de la URL de la pestaña. |
| `canonical` | SKU del `<link rel="canonical">`. |
| `variant` | Atributo `skuAttr`, con el link armado según `variant` del sitio. Si el producto no trae el atributo `variant.attr`, la variante sale del texto del primer elemento `variantChild` con la expresión `variantChildText` (grupo 1). Sephora: `[data-at="item_sku"]` con `^Item (\d+)$`, para los productos de un solo SKU. |
| `linkBase` / `urlBase` | Como `link` y `url`, pero con `skuBase` (modelo base); el link queda sin parámetros. |
| `childBase` | Atributo `skuAttr` (por defecto `data-pid`) del primer elemento `skuChild`, con `skuBase`. |
| `linkEstilo` / `urlEstilo` | Iguales a `linkBase` y `urlBase` (Kate Spade), con otro nombre para que las versiones sin familias de Kate Spade no extraigan. |

Claves que acompañan a esas fuentes:

| Clave | Uso |
|---|---|
| `skuAttr` | Atributo que leen `attr`, `variant` y `childBase`. |
| `skuChild` | Selectores del elemento con el SKU para `childBase`. Con `urlBase`, si existe y su modelo no es el de la URL, se toma ese modelo (página que reúne varios modelos: al elegir un color del otro la página cambia sin cambiar la URL). |
| `linkChild` | Con `urlBase` y otro modelo abierto: selectores del elemento con el link de ese modelo. Si el link no es de ese modelo, se usa la URL de la pestaña con el ID cambiado (`…/<ID>.html`). |
| `linkChildAttr` | Atributo de `linkChild` que se lee (por defecto `value`). |
| `linkChildKey` | Si el atributo es un JSON, la clave con el link. Layout `mj-detalle` de Marc Jacobs: `input#selected-express-product` y `selectedProductUrl`. |
| `variantChild` / `variantChildText` | Ver la fuente `variant`. |

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

**Consejos:**
- Evita las clases con hash, que cambian en cada despliegue de Amazon (`ProductGridItem__itemOuter__KUtvv`). Usa `[class*="ProductGridItem__itemOuter"]`.
- Prefiere `data-testid`, `data-asin`, `data-cy` y `data-component-type`, que son más estables.
- Un selector inválido no rompe nada: simplemente no encuentra elementos.
- En el resumen de la extracción verás una línea por layout, `<label>: X de Y` (p. ej. `EditorialTile: 12 de 14`), es decir, cuántos productos leyó de cuántos contenedores encontró. Sirve para diagnosticar.

## Sitios (`sites`)

La extensión trabaja con varios ecommerce. Cada sitio de `sites[]` **sobrescribe** las claves generales de la configuración (`layouts`, `pageTypes`, `price`, `image`, `history`, `pageBrand`, `productUrl`…) con las suyas. Si no las trae, usa las generales, que son las de **Amazon**. Por eso Amazon sigue configurado en la raíz del archivo y las versiones 1.7.x lo leen igual (ignoran `sites`).

### Identidad del sitio

| Clave | Uso |
|---|---|
| `id` / `name` | Identificador interno y nombre visible (`michaelkors` / `Michael Kors`). |
| `title` | Título del popup y del icono en ese sitio (`Michael Kors Product Scraper`). |
| `icono` | Nombre del icono del sitio (`michaelkors`): la extensión usa `icons/sitios/<icono>-16.png` y `-32.png` **del paquete**, en la barra (por pestaña) y en el popup. Chrome no acepta imágenes remotas: un icono nuevo requiere versión nueva. Solo letras minúsculas, números y `-`. Sin esta clave se usa el `id` del sitio; si el paquete no trae ese archivo, se usa el icono general. |
| `hosts` | Dominios del sitio; también vale cualquier subdominio (`michaelkors.com` cubre `www.michaelkors.com`). Kate Spade usa `www.katespade.com` para dejar fuera el outlet (`surprise.katespade.com`). |
| `homeUrl` | Enlace que muestra el popup en la lista de sitios disponibles. |
| `ecomerce` | Nombre del ecommerce (`"Marc Jacobs"`); es el que usan `xlsx.skuOnlyInLink` y `xlsx.linkOmit`. La columna `ecomerce` del Excel lo lleva **sin espacios** (`MarcJacobs`), como en el desplegable de la plantilla. |
| `groupName` | Nombre de grupo por defecto: `param` (parámetro de búsqueda, p. ej. `q`) y `strip` (expresiones que se quitan del título). |
| `brandDefault` | Marca de los productos cuando la tarjeta no la trae (sitio de una sola marca: `Marc Jacobs`). Solo llena `ref_marca`. |

### SKU y link

| Clave | Uso |
|---|---|
| `skuPattern` | Expresión regular que debe cumplir el SKU (por defecto, ASIN de 10 caracteres). |
| `skuFromLink` | Expresión para sacar el SKU de la **ruta** del link (grupo 1). Michael Kors: `/([^/]+)\.html$`, la misma regla que usa el backend. Con esta clave el link del Excel es el enlace de donde salió el SKU. |
| `productUrl` | Plantilla del link (`https://www.amazon.com/dp/{asin}`). Vacío = usar el enlace de donde salió el SKU. |
| `variant` | Productos cuyo link debe llevar la variante (Sephora): `attr` (atributo con la variante, p. ej. `data-cnstrc-item-variation-id`), `pattern`, `param` (parámetro del link, `skuId`), `origin` (dominio del link), `pathStrip` (prefijos de región que se quitan de la ruta) y `linkCheck` (expresión del backend: el grupo 1 debe ser el SKU; si no, el producto se omite). El link queda `origin + ruta + ?skuId=<variante>`, sin otros parámetros. |
| `skuBase` | El SKU es el **modelo base**: corta en el primer `cutAt`, pasa a mayúsculas y quita lo que cumpla `strip` (`[^A-Z0-9]`). `H001M01SP21-001` → `H001M01SP21`. Se aplica con las fuentes `…Base` y `…Estilo` de `asinFrom`. Los colores de un modelo quedan en una sola fila (la del primer color que aparece) y el resumen dice cuántos se agruparon. `cutAt` puede ser una lista: Kate Spade `["-", "%20", " "]`, porque sus links pueden traer `KP500-001.html` o `KP500%20BLK.html` (los dos dan `KP500`). |

### Imagen e historial

| Clave | Uso |
|---|---|
| `image.hosts` / `image.replace` | Dominios de imagen aceptados y reemplazos en la URL (`/ECOM_Image_Medium/` → `/ECOM_Image_Large/`). |
| `image.fromLink` | Imagen armada desde el link cuando la tarjeta aún no la tiene (Kate Spade crea el `<img>` al verse la tarjeta, y nunca en las páginas descargadas): `pattern` (expresión sobre la ruta del link) y `template` (URL con `{1}`, `{2}`… de los grupos). `/([A-Za-z0-9]+)-([A-Za-z0-9]+)\.html$` + `https://katespade.scene7.com/is/image/KateSpade/{1}_{2}?$desktopProductTile$`. La URL debe cumplir `image.hosts`. |
| `history.keepParams` / `keepParamsPattern` / `productPattern` | Parámetros que identifican un listado (también por expresión, p. ej. filtros `prefn1`, `prefv1`…) y ruta de la página de producto, que se compara sin parámetros. |

### Páginas y regiones

| Clave | Uso |
|---|---|
| `onlyPath` | `pattern` (ruta que debe cumplir la página; Marc Jacobs `^/us-en(/\|$)`) y `message` (aviso). Fuera de esa ruta no se extrae y no se ofrece redirección. |
| `searchOverlay` | Búsqueda abierta en un panel sobre otra página (Marc Jacobs): `selector` (el panel abierto), `query` (selectores del término buscado) y `url` (página de resultados, con `{q}`). El popup no muestra **Extraer** y ofrece **Abrir resultados como página**. |
| `regions` | Versiones de otra región; en esas páginas no se extrae y el popup ofrece abrir la versión de EE. UU. `pathPrefix`: mismo dominio (p. ej. `/ca/en`), se abre la misma ruta sin el prefijo. `hostPattern`: otros dominios (p. ej. `sephora.fr`), se busca en EE. UU. con `searchUrl`, usando el parámetro de búsqueda de `queryParams` o el título sin `titleStrip`. `otherPath` (Marc Jacobs, `^/(?!us-en(/|$))[a-z]{2}-[a-z]{2}(/|$)`): mismo dominio con otra región cuyas rutas no existen en EE. UU.; se abre `homeUrl` (`/us-en/homepage`). |

### Carga de más productos (`loadMore`)

El límite puede ser por **páginas** (el modo inicial, 1 = solo la abierta) o por **productos**. Claves comunes:

| Clave | Uso |
|---|---|
| `mode` | Cómo se cargan las páginas siguientes: sin `mode`, **click** (botón "Load More", ver abajo); `"scroll"` o `"fetch"`. |
| `item` | Tarjetas que se cuentan. Sin `item` no se pide límite. |
| `name` | Texto del botón que se muestra en el popup y en los avisos. |
| `urlPattern` | Rutas donde se pide el límite (Amazon `/s`, así la tienda de marca y la portada `/b` se extraen enteras). |
| `maxPages` | Tope de páginas por extracción (10). Marc Jacobs, 40 como tope de tramos. |
| `pageParam` | Parámetro con el número de la página abierta (`currentPage` en Sephora, `page` en Amazon); sin él, se empieza en 1. El popup muestra "Páginas a extraer: N a M". |
| `pageSize` | Productos por página, solo para la ayuda del popup (Michael Kors 24). |
| `defaultLimit` / `maxLimit` | Límite por defecto y máximo del modo productos (50 y 500 si no se indican). |
| `limitModes` | `["productos"]`: el límite solo se pide por productos (sin la pestaña **Páginas**). Marc Jacobs y Kate Spade. |
| `delayMs` / `timeoutMs` | Pausa entre cargas y espera máxima de cada una. |

**Modo click (por defecto, sin `mode`).** Pulsa el botón "Load More" hasta el límite o hasta que no haya botón; cada clic cuenta como una página. `button` (selectores, se usa el primero visible), `timeoutMs` (espera por clic), `delayMs` y `maxClicks` (tope de clics, 100 por defecto). Hoy **ningún sitio** lo usa: Michael Kors pasó a `fetch` por tramos.

**`mode: "scroll"` (Sephora).** Listados **virtualizados**: solo se dibujan los productos cerca de la pantalla, así que se leen en cada paso del desplazamiento. Al final de la página se pulsa el botón de la página siguiente: `button` (selectores) + `buttonText` (expresión que debe cumplir su texto). Tras el clic espera hasta `timeoutMs` a que cambie la URL **o** el primer producto (atributo `firstAttr`, por defecto `href`); si no cambia ninguno, se queda con lo cargado. Luego exige **productos nuevos**: si no aparecen, la página no cuenta. Otras claves: `stepDelayMs` (pausa por paso), `stableSteps` (pasos sin crecer al final para darla por terminada), `maxSteps`. Si la página se recarga entera al pasar de página, la extracción se pierde y el popup lo avisa.

**`loadMore.json` (Sephora).** Listado leído desde los datos que envía el servidor en la página, sin bajar por ella: `script` (selector del `<script>` con el JSON, `script#linkStore`), rutas `products`, `total`, `pageSize`, `page` (`*` = la primera clave donde siga la ruta, p. ej. `page.*.products`) y `fields` (ruta de cada dato: `asin`, `variante`, `link`, `nombre`, `marca`, `imagen`, `precio` como lista de rutas en orden, `excluir` para anuncios). Las páginas siguientes se piden con `pageParam`. Si la página no trae esos datos (búsquedas de Sephora), se lee al bajar (`mode: "scroll"`).

**`mode: "fetch"` (Amazon, en `sites[0]`).** La página siguiente recarga la pestaña, así que se **descarga en segundo plano** (misma sesión) y se lee con los mismos layouts, sin navegar. `next` (selectores del enlace "Siguiente"), `delayMs` (pausa entre páginas, 1500), `maxPages` (10), `defaultLimit` (60), `maxLimit`. Para si una página falla o no trae productos nuevos.

**`fetch` por tramos (Michael Kors, Marc Jacobs).** `next` + `nextAttr` (`data-url` del botón "Load More"), y si un tramo no trae botón pero viene completo, el siguiente se arma sumando `sizeParam` a `startParam` (`start += sz`). Si el botón de la página abierta aún no existe, se busca en la copia del servidor. En los layouts, `fetchItem` es el selector de las tarjetas en un tramo descargado. Marc Jacobs: tramos de `Search-UpdateGrid` (`data-url` de `.show-more-tiles`, 18 por tramo).

**`loadMore.pageFetch` (Kate Spade, con `mode: "fetch"`).** Scroll infinito que cambia la URL (`?page=3`) y deja en la pestaña las páginas 1 a 3. La página siguiente se arma desde la URL de la pestaña (nunca desde `rel=next` de la pestaña, que tras navegar dentro del sitio puede ser de otra página): `param` (`page`) y `startParam` (`startFrom`): primero `?page=4&startFrom=4` (solo esa página); si no trae nada nuevo, `?page=4` (la lista completa hasta ella, deduplicada). En las páginas descargadas, sin `next` (`link[rel="next"]`) ya no hay más.

### Familias (`familias`)

Un producto por **familia** (todas las variantes de un padre). La familia de cada producto se lee de su página (en la página de producto, de la misma página). Sin esta clave no se verifican familias.

**Amazon (`sites[0]`):**

| Clave | Uso |
|---|---|
| `parent` | Expresión con el ASIN padre en el grupo 1 (`"parentAsin"…`). |
| `hermanos` | Expresión con el JSON de las variantes en el grupo 1 (`"dimensionToAsinMap"…`). |
| `producto` | Marca de página de producto válida (`id="productTitle"`), para un producto sin variantes. |
| `captcha` | Marca de la página de verificación: al verla, se deja de descargar. |
| `delayMs` / `delayMaxMs` | Pausa al azar entre descargas (1500–3000). |
| `variantes` | Expresión con el JSON de los atributos de cada variante en el grupo 1 (`"dimensionValuesDisplayData"…`; por defecto en el código). |

**Kate Spade (`tipo: "jsonld"`):**

| Clave | Uso |
|---|---|
| `tipo` | `"jsonld"`: la familia sale del `ProductGroup` del JSON-LD de la página del producto (`hasVariant[].sku`, cortado en el espacio o el `-`); se descarga el link del producto. |
| `siempre` | `true`: uno por familia aunque el grupo no tenga *Extraer variantes*. |
| `descargarPropia` | `true`: en la página de producto se lee una copia nueva de la URL de la pestaña, no el JSON-LD de la pestaña. |
| `guardarHermanos` | `true`: guarda los estilos de la familia en la lista (`hermanos`), para reconocerla en extracciones siguientes sin descargar. |
| `captcha` | `<title>Access Denied`; un 403 también cuenta como bloqueo. |

Como cada página de Kate Spade nombra la familia con su propio estilo, un producto cuyo hermano ya tiene familia toma esa familia.

**Datos de variantes para la vista previa** (no van al Excel): cada producto guarda `variantes` (Amazon: ASIN, atributos e imagen de `colorImages`; Kate Spade: nombre, color, imagen, precio y link de `hasVariant`) y `variantesDims` con las dimensiones de la página: `dimensions`, `visualDimensions` (las que cambian la foto, por las que agrupa la vista previa), `variationValues` para el orden y `variationDisplayLabels` para el nombre.

### Versiones anteriores y sitios nuevos

Una versión que no conoce un sitio igual lo ve en `sites` (la configuración es remota). Por eso un sitio nuevo usa claves o fuentes que las versiones anteriores no entienden, para que allí no extraiga nada en lugar de escribir un SKU equivocado:

- Sephora usa `asinFrom: ["variant"]`, que la v1.8.0 no entiende. Los productos de un solo SKU (`variantChild`) no se extraen antes de la v1.12.1.
- Marc Jacobs usa `linkBase`/`urlBase`/`childBase`, que la v1.9.0 no conoce.
- Kate Spade usa `linkEstilo`/`urlEstilo`, que la v1.10.x no conoce: sin familias de Kate Spade dejaría estilos de una misma familia (la v1.10.x puede inyectarse con `activeTab` aunque no tenga el permiso del dominio).
- Las versiones 1.6.x ignoran `pageTypes` y no encuentran ASIN en `detalle` (no conocen `input`/`url`), así que en ellas no cambia nada.
- `icono`, `familias` y `linkOmit` se ignoran en las versiones que no los conocen (sin `linkOmit` escriben el link de Amazon).

**Añadir un sitio nuevo** requiere versión nueva: hay que agregar su dominio a `host_permissions` en `manifest.json`. Después, sus selectores se corrigen solo con `config.json`.

## Salida Excel (`xlsx`)

El archivo se genera desde `plantilla.xlsx`, una copia de la plantilla de scraping del sistema incluida en la extensión. Las columnas se buscan **por nombre** en la fila 1, no por posición. La hoja `Mapeo_categorias` se llena con las categorías actuales. Cómo lee el backend cada columna: [BACKEND.md](BACKEND.md).

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
| `ecomerce` | Valor de la columna `ecomerce` solo para productos de versiones anteriores sin ecommerce guardado; los demás llevan el de su sitio (`sites[].ecomerce`, sin espacios en el Excel). |
| `seguimiento` | Valor fijo de esa columna. |
| `condicion` | Si el título cumple `pattern` (sin distinguir mayúsculas) se escribe `match`; si no, `default`. |
| `imageFormula` | Fórmula de la vista previa; `{celda}` se reemplaza por la celda con la URL. |
| `rowHeight` | Alto de las filas de productos, para que se vea la imagen. `0` = alto normal. |
| `skuOnlyInLink` | Ecommerce cuyo SKU el sistema saca del link: en sus filas la celda `sku` no se escribe. Hoy `["Sephora", "Michael Kors", "Marc Jacobs", "Kate Spade"]` (todos menos Amazon; es también el valor por defecto). |
| `linkOmit` | Ecommerce que van solo con `sku`: en sus filas la celda `link` no se escribe (`["Amazon"]`, también el valor por defecto). |
| `refColumns[]` | Columnas de ayuda, que van después de `seguimiento` (las columnas de la plantilla que la siguen, `marca`…`precio`, se corren a la derecha). `field` puede ser `imagen`, `nombre`, `marca`, `precio`, `link`, `asin`, `variante` (skuId de Sephora), `duplicado` o `grupo` (nombre del grupo); `imageOf` crea la vista previa de otra columna. |

**Nombres prohibidos en `refColumns`:** el sistema lee estas columnas y las tomaría como datos fijos, así que la extensión las descarta aunque estén en la configuración: `ecomerce`, `sku`, `link`, `variacion`, `condicion`, `marca`, `nombre`, `categoria_general`, `codigo_categoria`, `color`, `talla`, `seguimiento`, `guia_talla`, `cantidad_imagen`, `peso`, `precio`, `stock`, `created_code`, `variant_id`, `parent_sku`, `base_sku`. Usa el prefijo `ref_`.

Si cambia la plantilla del sistema, reemplaza `plantilla.xlsx` (requiere versión nueva). La incluida tiene otro orden que la del sistema: `ecomerce`, `sku`, `variacion`, `guia_talla`, `condicion`, `link`, `Buscar categoria`, `codigo_categoria`, `seguimiento` y luego `marca`…`precio` (con sus desplegables, el formato condicional, la validación de datos y la fórmula de `codigo_categoria` ajustados). Al reemplazarla hay que reordenarla igual y volver a poner el formato condicional y la validación en `xl/worksheets/sheet1.xml`. Debe conservar `Plantilla` como primera hoja y las columnas `ecomerce`, `sku`, `condicion`, `link` y `seguimiento`.

## `config.default.json`

Es la copia que va **dentro** de la extensión y se usa si GitHub no responde. Al publicar una versión nueva, déjala igual que `config.json`.
