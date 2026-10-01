# Guía de uso

## Flujo normal

1. Abre en un sitio disponible una **búsqueda**, una **categoría**, una **tienda de marca** o la **página de un producto**. Sitios disponibles: **Amazon.com** y **Michael Kors** (`www.michaelkors.com`).
2. Pulsa el icono de la extensión → **Extraer productos**. El título del popup indica el sitio (*Amazon Product Scraper*, *Michael Kors Product Scraper*). En otra página, el popup se llama *COMPRAFACIL Scraper* y muestra los sitios disponibles con su enlace.
3. Si esa página **ya se extrajo antes**, aparece un aviso con la fecha, la categoría y los productos. Elige:
   - **Reemplazar datos anteriores**: quita de la lista los productos y el grupo de la extracción anterior y la hace de nuevo desde cero.
   - **Cancelar**.
4. Elige la **categoría** de los productos (ver abajo).
5. Revisa el **nombre del grupo** (ver abajo) y pulsa **Extraer**.
6. La extensión carga los productos y los añade a la lista: en Amazon baja la página sola; en Michael Kors pulsa **Load More** hasta el máximo indicado (ver abajo). **No cierres el popup mientras trabaja.**
7. Repite con otras páginas, también de otro sitio: un mismo Excel puede tener productos de Amazon y de Michael Kors, cada fila con su `ecomerce`. La lista acumula productos sin repetir SKU: si un SKU ya estaba en otro grupo, se queda con los datos y el grupo de la última extracción.
8. Al terminar, pulsa **Descargar Excel**. Opcionalmente escribe un nombre, por ejemplo `Audifonos Hyperx`, y pulsa **Descargar**.
   - Resultado: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`
   - Sin nombre: `Plantilla_Scraping_2026-09-30_14-35.xlsx`
9. Pulsa **Limpiar** para empezar una lista nueva. También se borran los grupos.

## Página de un producto

En la página de un solo producto de Amazon (`/dp/…` o `/gp/product/…`) se extrae **solo ese producto**: los carruseles de sugerencias, "productos relacionados" y accesorios se ignoran. Se capturan los mismos datos que en una búsqueda: ASIN de la variante que se ve en pantalla, nombre, marca, precio e imagen. Si el producto no tiene precio, se extrae igual sin precio. En esta página no se desplaza la página automáticamente.

## Michael Kors

- **Listados** (búsqueda o categoría): la página muestra 24 productos y un botón **Load More**. En el formulario aparece **Máximo de productos** (por defecto **50**; se recuerda el último que usaste). La extensión pulsa **Load More** sola y muestra el avance (*"Cargando productos… 48 de 50"*). Al final extrae como máximo ese número, en el orden de la página.
- Si el botón deja de cargar productos, se extrae lo que ya cargó y el resumen lo avisa.
- **Página de producto** (`…/<nombre>/<ID>.html`): se extrae solo ese producto, sin las sugerencias. No se pide el máximo.
- **SKU y link:** el SKU es el ID del estilo (p. ej. `40F6HRMB5S`) y sale del link `/<ID>.html`, la misma regla que usa el sistema. Así `sku` y `link` siempre coinciden. Una variante de color va en el link (`?dwvar_…_color=0230`), pero el sistema no la usa: las variantes las extrae el bot.
- Si un producto no tiene un link `/<ID>.html`, se omite y el resumen lo avisa (el sistema descartaría esa fila sin avisar).
- El nombre del grupo por defecto es el texto buscado (*boots*) o el título de la página sin "| Michael Kors".

## Nombre del grupo

Cada vez que pulsas **Extraer** se crea un **grupo** con los productos de esa extracción. Su nombre sale en la columna `ref_grupo` del Excel, para distinguir las extracciones dentro del archivo unificado.

- Por defecto se propone el **título de la página** recortado (por ejemplo *hyperx headset* o *Apple AirPods Pro (2ª generación)*). Puedes cambiarlo antes de extraer.
- **No se permiten dos grupos con el mismo nombre** (sin distinguir mayúsculas ni tildes). Si el título ya existe, se propone con un número: *hyperx headset (2)*.
- El nombre del grupo **no** cambia el nombre del archivo Excel.

## Elegir la categoría

Hay dos formas. La extensión recuerda la última que usaste.

**🔍 Buscar:** escribe cualquier parte del nombre o el código.
- `ollas` → *Hogar / Menaje de Cocina / Juegos de ollas*
- `zapatillas mujer` → *Calzado / Calzado para Mujer / Zapatillas Deportivas*
- `CF0101` → todas las de Hogar / Menaje de Cocina

No distingue tildes ni mayúsculas, y las palabras pueden ir en cualquier orden. Usa ↑ ↓ para moverte y **Enter** para elegir. Con el campo vacío aparecen las categorías usadas recientemente.

**☰ Por niveles:** elige **Principal → Secundaria → Terciaria**. Cada lista muestra solo las opciones del nivel anterior.

Al elegir, debajo aparece el **código** (por ejemplo `Código: CF130704`).

**No llenar categoría:** si no quieres elegir la categoría ahora (por ejemplo, la página mezcla productos de varias categorías), marca esta casilla. `Buscar categoria` y `codigo_categoria` quedan vacías para elegirlas fila por fila con el desplegable de la plantilla. Empieza siempre desmarcada.

**↻ Actualizar:** vuelve a descargar la lista de categorías. Úsalo si acaban de crear una categoría en el sistema.

## El Excel

Es la **plantilla de scraping del sistema** (`Plantilla_Scraping_General.xlsx`) ya llenada: mismas columnas, desplegables y colores. Se sube tal cual al sistema; el bot de scraping extrae el resto de datos.

**Lo que llena la extensión:**

| Columna | Valor |
|---|---|
| `ecomerce` | `Amazon` o `Michael Kors`, según el sitio de cada producto |
| `sku` | ASIN (Amazon) o ID del estilo (Michael Kors) |
| `condicion` | `Reacondicionado` si el título dice *Renewed* / *Refurbished*; si no, `Nuevo`. **Revísala.** |
| `link` | Amazon: `https://www.amazon.com/dp/<ASIN>`. Michael Kors: el link del producto, terminado en `/<ID>.html` |
| `Buscar categoria` | Ruta de la categoría elegida en el popup (vacía con *No llenar categoría*) |
| `codigo_categoria` | Código de esa categoría. Es una fórmula: si cambias `Buscar categoria`, se actualiza sola |
| `seguimiento` | `Scraping` |

**Lo que llena la persona:** `variacion` (Sí = el bot extrae todas las variantes y agrupa la familia) y `guia_talla` (Sí / No). Quedan vacías. El resto de columnas de la plantilla (`marca`, `nombre`, `precio`, `peso`…) se dejan **vacías**: si se llenan, el sistema las toma como valores fijos.

**Columnas de ayuda** (después de `precio`; el sistema las ignora):

| Columna | Para qué |
|---|---|
| `ref_grupo` | Nombre del grupo (la extracción) de donde salió el producto. Las filas salen ordenadas por grupo, en orden de extracción |
| `ref_imagen_link` | URL de la imagen |
| `ref_imagen` | Vista previa con `=IMAGE()`. Funciona en **Google Sheets** (en LibreOffice o Excel antiguo muestra `#NAME?`) |
| `ref_nombre` / `ref_marca` / `ref_precio` | Nombre, marca y precio que muestra Amazon, solo como referencia |
| `ref_duplicado` | `Posible variante: fila N` cuando otra fila tiene el mismo nombre o la misma imagen. Suele ser otro color o talla del mismo producto: deja una sola fila y marca `variacion = Sí` |

**Para que la carga no pierda filas:**
- Sube el archivo como **.xlsx** (en Google Sheets: *Archivo → Descargar → Microsoft Excel*). **Nunca como CSV**: en CSV las celdas vacías llegan como texto vacío y el sistema descarta esas filas sin avisar.
- No dejes un `sku` "vacío" con un espacio o con una fórmula que devuelva `""`: el sistema descarta la fila sin avisar. Para quitar un producto, borra la fila entera.
- No uses guiones en `sku`: el sistema corta el valor en el primer `-`.
- El sistema solo **crea** productos: si un SKU ya existe, la fila se ignora (no se actualiza).
- `Plantilla` debe seguir siendo la **primera** pestaña.

## Panel de la lista

Debajo del botón principal verás cuántos productos hay en la lista y los grupos, por ejemplo *"hyperx headset · 24 productos ↗"*.

- **Doble clic en el nombre** para renombrar el grupo. **Enter** o salir del campo guarda; **Esc** cancela. Un nombre vacío o repetido no se acepta.
- **↗** abre la página de donde salieron los productos.
- Al pasar el ratón por el nombre se ve la categoría y el título de la página.
- Los productos que ya estaban en la lista antes de la v1.7.0 reciben un grupo por página, con el título guardado en el historial.

## Opciones

Clic derecho en el icono → **Opciones**, o el enlace *Opciones* abajo en el popup.

- **Configuración remota:** estado de los selectores y botón **Comprobar ahora**.
- **Categorías:** cuántas hay, de dónde vienen y el botón **Actualizar categorías**.
- **Extracción:**
  - *Desplazar la página*: activado por defecto.
  - *Acumular varias páginas*: activado por defecto. Si lo desactivas, cada extracción descarga su propio Excel y el nombre se pide en el mismo formulario.
- **Historial de páginas extraídas:** tus últimas 150 páginas, con enlace, fecha y categoría. **Quitar** permite volver a extraer una página sin aviso.

## Historial personal

- Cada persona ve **solo su historial**. Se guarda en su cuenta de Google (sincronización de Chrome) y la sigue en cualquier PC.
- Se conservan las **últimas 150 páginas**.
- Descargar el Excel o limpiar la lista **no** borra el historial.
