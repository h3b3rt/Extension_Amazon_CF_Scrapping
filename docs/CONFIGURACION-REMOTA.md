# Configuración remota

Manifest V3 **no permite descargar y ejecutar código**. Por eso todo lo que suele romperse cuando Amazon cambia su HTML (los **selectores**) y el formato del CSV viven en un archivo de **datos**, [`config.json`](../config.json). Todas las extensiones lo leen desde:

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
- `csv.headers` y `csv.fields` son obligatorios.

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
| `price` | Selectores del precio estándar `.a-price`, ignorando el precio tachado. |
| `layouts[]` | Tipos de página y cómo leer cada producto (ver abajo). |
| `csv` | Nombre del archivo, columnas, qué dato va en cada columna y valores fijos. |

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
| `asinFrom` | Dónde buscar el ASIN, en orden. `attr` usa el `data-asin` del contenedor, `child` el `[data-asin]` de un hijo, `csaItemId` el `data-csa-c-item-id="amzn1.asin.XXXX"` y `link` el ASIN que aparece en el enlace `/dp/XXXX`. |
| `title` | Nombre. Si el elemento tiene atributo `title`, se usa ese; si no, su texto. |
| `brand` | Marca. Si está vacío, se usa la primera palabra del nombre. |
| `image` | Imagen. Se elige la mayor resolución de `srcset` / `data-a-dynamic-image`. |
| `priceWhole` / `priceFraction` | Precio partido en entero + decimales. Es opcional; si falta, se usa el `.a-price` estándar. |
| `priceText` | Último recurso: busca `$123.45` en el texto de esos elementos. |

**Consejos:**
- Evita las clases con hash, que cambian en cada despliegue de Amazon (`ProductGridItem__itemOuter__KUtvv`). Usa `[class*="ProductGridItem__itemOuter"]`.
- Prefiere `data-testid`, `data-asin`, `data-cy` y `data-component-type`, que son más estables.
- Un selector inválido no rompe nada: simplemente no encuentra elementos.
- En el popup, tras extraer, verás `Layout: X de Y`, es decir, cuántos productos leyó de cuántos contenedores encontró. Sirve para diagnosticar.

## Columnas del CSV (`csv`)

```json
"csv": {
  "filenamePrefix": "Plantilla_Scrapping",
  "headers": ["PUBLICAR", "SKU HIJOS", "SKU PADRE", "..."],
  "fields":   { "SKU PADRE": "asin", "CATEGORIA PRINCIPAL": "categoria", "...": "..." },
  "defaults": { "PESO APROX": "1" }
}
```

Datos disponibles para `fields`: `asin`, `nombre`, `marca`, `imagen`, `precio`, `link`, `categoria`, `categoriaSecundaria`, `categoriaTerciaria`, `codCategoria`.

## `config.default.json`

Es la copia que va **dentro** de la extensión y se usa si GitHub no responde. Al publicar una versión nueva, déjala igual que `config.json`.
