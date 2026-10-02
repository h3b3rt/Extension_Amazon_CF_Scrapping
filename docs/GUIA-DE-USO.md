# Guía de uso

## Flujo normal

1. Abre en un sitio disponible una **búsqueda**, una **categoría**, una **tienda de marca** o la **página de un producto**. Sitios disponibles: **Amazon.com**, **Michael Kors** (`www.michaelkors.com`), **Sephora** (`www.sephora.com`) y **Marc Jacobs** (`www.marcjacobs.com/us-en/`).
2. Pulsa el icono de la extensión → **Extraer productos**. El título del popup indica el sitio (*Amazon Product Scraper*, *Michael Kors Product Scraper*, *Sephora Product Scraper*, *Marc Jacobs Product Scraper*). En otra página, el popup se llama *COMPRAFACIL Scraper* y muestra los sitios disponibles con su enlace.
3. Si esa página **ya se extrajo antes**, aparece un aviso con la fecha, la categoría y los productos. Elige:
   - **Reemplazar datos anteriores**: quita de la lista los productos y el grupo de la extracción anterior y la hace de nuevo desde cero.
   - **Cancelar**.
4. Elige la **categoría** de los productos (ver abajo).
5. Revisa el **nombre del grupo** (ver abajo) y pulsa **Extraer**.
6. La extensión carga los productos y los añade a la lista: en Amazon lee la página y las siguientes; en Michael Kors y Marc Jacobs descarga los productos que traerían **Load More** o el scroll, y en Sephora baja la página y pasa de página, hasta el límite indicado (ver *Límite de la extracción*). **No cierres el popup mientras trabaja.**
7. Repite con otras páginas, también de otro sitio: un mismo Excel puede tener productos de Amazon, Michael Kors, Sephora y Marc Jacobs, cada fila con su `ecomerce`. La lista acumula productos sin repetir SKU: si un SKU ya estaba en otro grupo, se queda con los datos y el grupo de la última extracción.
8. Al terminar, pulsa **Descargar Excel**. Opcionalmente escribe un nombre, por ejemplo `Audifonos Hyperx`, y pulsa **Descargar**.
   - Resultado: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`
   - Sin nombre: `Plantilla_Scraping_2026-09-30_14-35.xlsx`
9. Pulsa **Limpiar** para empezar una lista nueva. También se borran los grupos.

## Página de un producto

En la página de un solo producto de Amazon (`/dp/…` o `/gp/product/…`) se extrae **solo ese producto**: los carruseles de sugerencias, "productos relacionados" y accesorios se ignoran. Se capturan los mismos datos que en una búsqueda: ASIN de la variante que se ve en pantalla, nombre, marca, precio e imagen. Si el producto no tiene precio, se extrae igual sin precio. En esta página no se desplaza la página automáticamente.

## Extracciones en segundo plano y cola

- Al pulsar **Extraer** la extracción empieza y **puedes cerrar el popup o ir a otra página**: sigue sola. Al terminar aparece una **notificación de Chrome** (al pulsarla se abre la pestaña de la extracción) y el icono muestra **✓**. Mientras trabaja, el icono muestra el avance (`2/5` páginas, o el número de productos).
- **Una a la vez, con cola:** si ya hay una en curso, la nueva queda **en cola** y empieza sola cuando termine la anterior. Así puedes dejar una extracción de varias páginas y mientras tanto ir buscando otras páginas para añadir.
- Al abrir el popup ves la extracción en curso (*"Página 3 de 5 · 174 productos"*), con **Ir a la pestaña** y **Detener y guardar lo leído**, y debajo la cola, con **✕** para quitar una.
- **No cierres la pestaña** de la extracción. Si se cierra, o la página cambia, se guarda lo leído hasta ese momento, con un aviso en su resumen, y sigue la cola. Si la pestaña de una extracción en cola ya no está en esa página, se abre la página en una pestaña nueva en segundo plano.
- **Pausa:** las búsquedas de Sephora solo se leen con la pestaña a la vista (Sephora dibuja los productos al bajar). Si cambias de pestaña, esa extracción se **pausa** (icono **⏸**, y el popup dice *"vuelve a la pestaña de Sephora para continuar"*) y sigue sola al volver. Amazon, Michael Kors y las categorías y marcas de Sephora se leen en segundo plano, sin necesidad de ver la pestaña.
- Una misma página no puede estar dos veces en la cola.

## Límite de la extracción

En los listados con varias páginas (búsquedas y categorías de Amazon, Michael Kors, Sephora y Marc Jacobs) el formulario muestra **Límite de la extracción**, con dos modos (en Marc Jacobs, solo **Productos**: no tiene páginas). Se usa uno a la vez:

- **Páginas** (modo inicial, con **1**): **1 = solo la página actual**. Con más, sigue con las siguientes. Se cuenta desde la página abierta: en `currentPage=3` con 2 páginas se extraen la 3 y la 4, y el popup lo indica (*"Páginas a extraer: 3 a 4"*). Máximo **10** páginas por extracción. Entran todos los productos de esas páginas.
  - Sephora: cada página es una `currentPage` (unos 60 productos, sin anuncios).
  - Amazon: cada página es una página de resultados (unos 48 sin anuncios).
  - Michael Kors: la página actual son los 24 productos visibles, y cada **Load More** cuenta como una página más (24).
- **Productos**: hasta ese número de productos (máximo 500), pasando de página lo que haga falta.

Se recuerdan **por sitio** el modo y el número. Durante la carga verás *"Cargando página 2 de 3… 84 productos"*, y el resumen dice *"Páginas extraídas: 2 de 2 (de la 3 a la 4)"*. Las páginas sin más páginas (producto, tienda de marca y portada de categoría de Amazon) se extraen enteras, sin este campo.

## Amazon: listados

- **Búsqueda** (`/s?k=…`) y categorías con resultados (`/s?…rh=n:…`): la extensión lee la página abierta y, si el límite pide más, descarga las páginas siguientes (**Siguiente**) en segundo plano, sin cambiar la pestaña. Verás el avance.
- Si una página siguiente no carga o no trae productos nuevos (por ejemplo, Amazon pide verificar que no eres un robot), se extrae lo ya leído y el resumen lo avisa.
- **Anuncios** (*Patrocinado* / *Sponsored*): no se extraen. Si el mismo producto aparece también como resultado normal, sí entra. El resumen dice cuántos anuncios se omitieron.
- **Portada de categoría** (`/b?node=…`, la que muestra carruseles por tema): se extraen los productos de todos los carruseles visibles. Mezcla temas (por ejemplo tarjetas de regalo o fundas): si quieres solo una parte, entra en su **Ver más** y extrae esa lista.
- **Tienda de marca** (`/stores/…`, también con `/-/es/` en la URL): la marca de la tienda se toma como marca de los productos.

## Michael Kors

- **Listados** (búsqueda o categoría): la página muestra 24 productos y un botón **Load More**. Con el límite en más de 1 página (o por productos), la extensión descarga en segundo plano los tramos que traería **Load More** (24 cada uno), sin necesidad de ver la pestaña, y muestra el avance.
- Si el botón deja de cargar productos, se extrae lo que ya cargó y el resumen lo avisa.
- **Página de producto** (`…/<nombre>/<ID>.html`): se extrae solo ese producto, sin las sugerencias. No se pide el máximo.
- **SKU y link:** el SKU es el ID del estilo (p. ej. `40F6HRMB5S`) y sale del link `/<ID>.html`, la misma regla que usa el sistema. Así `sku` y `link` siempre coinciden. Una variante de color va en el link (`?dwvar_…_color=0230`), pero el sistema no la usa: las variantes las extrae el bot.
- Si un producto no tiene un link `/<ID>.html`, se omite y el resumen lo avisa (el sistema descartaría esa fila sin avisar).
- El nombre del grupo por defecto es el texto buscado (*boots*) o el título de la página sin "| Michael Kors".

## Sephora

- **Categorías y marcas:** la extensión lee los 60 productos de cada página desde los datos que envía Sephora (`?currentPage=1, 2, 3…`), sin bajar por la página y sin necesidad de verla. Esos datos no traen anuncios.
- **Búsquedas** (`/search?keyword=…`): Sephora no envía esos datos, así que la extensión baja la página poco a poco y lee cada producto al pasar (Sephora solo dibuja los que están cerca de la pantalla), y sigue con **Show More Products**. Necesita la pestaña a la vista: si cambias de pestaña, se pausa. Los anuncios (*Sponsored*, unos 10 por página) **no se extraen** y el resumen dice cuántos se omitieron. **No toques la página mientras trabaja.**
- Si la página siguiente no carga, se extrae lo ya leído y el resumen lo avisa. Si la página se recarga entera, no se guarda nada: vuelve a intentarlo o extrae cada página por separado (Páginas = 1).
- **Página de producto** (`/product/…`): se extrae solo ese producto, con el tamaño o tono **elegido en ese momento**. No se pide el máximo.
- **SKU y link:** el sistema saca todo del link: el `skuId` (SKU) y el ID `P…` del producto. Por eso la columna `sku` queda **vacía** y el link es `https://www.sephora.com/product/<nombre>-P123456?skuId=1234567`. El `skuId` también va en `ref_sku_id`.
- Una fila por producto: el mismo `P…` no se repite aunque se vea con otro tono.
- Se omite (y el resumen lo avisa) un producto sin `skuId` o cuyo link tenga otro código parecido antes del `P…` (por ejemplo `-v2-`): el sistema lo descartaría o lo guardaría mal.
- **Precio** (solo referencia): el de oferta si hay; en un rango (*$25.00 - $52.00*) el promedio.
- **Otra región** (por ejemplo `sephora.fr` o `sephora.com/ca/en/…`): no se extrae. El popup ofrece **Abrir en www.sephora.com**: la misma página si es de Canadá; si es de otro país, una búsqueda del producto en EE. UU. (los códigos de otros países no sirven aquí).
- El nombre del grupo por defecto es el texto buscado (*parfum for woman*) o el título de la página sin "| Sephora".

## Marc Jacobs

- Solo la tienda de **EE. UU.** (`www.marcjacobs.com/us-en/…`). En otra región (`/es-es/`, `/gb-en/`…) no se extrae: el popup ofrece **Abrir en www.marcjacobs.com**, que abre la página principal de EE. UU. (`/us-en/homepage`; las categorías tienen otros nombres en cada región).
- **Listados** (categoría con o sin filtros, y la página de resultados `/us-en/search?q=…`): la página muestra 18 productos y carga más al bajar. La extensión descarga esos tramos en segundo plano (18 cada uno), sin bajar por la página ni necesitar verla. El límite es **solo por productos** (50 por defecto, máximo 500): no hay páginas.
- **Búsqueda:** el buscador abre un **panel** encima de la página y la URL no cambia. Con el panel abierto, el popup no extrae y ofrece **Abrir resultados como página**, que abre `/us-en/search?q=<texto>` en la misma pestaña. Ahí pulsa de nuevo **Extraer productos**.
- **Página de producto** (`…/<nombre>/<ID>.html`): se extrae solo ese producto, con el precio de venta (no el tachado). No se pide el máximo.
- **SKU:** el sistema solo lee la columna `sku`, y la corta en el primer `-`: todos los colores de un modelo son **un solo producto**. Por eso la extensión escribe el modelo base (`H004L01PF21-545` → `H004L01PF21`), deja una fila por modelo (la del primer color que aparece) y el resumen dice cuántos colores se agruparon. Los colores los extrae el bot con `variacion = Sí`.
- Se omite (y el resumen lo avisa) un producto sin ID en el link o con un SKU de más de 15 caracteres.
- Las recomendaciones (*You may also like*) no se extraen. No hay anuncios.
- El nombre del grupo por defecto es el texto buscado (*tote*) o el título de la página sin "| Marc Jacobs".

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
| `ecomerce` | `Amazon`, `Michael Kors`, `Sephora` o `Marc Jacobs`, según el sitio de cada producto |
| `sku` | ASIN (Amazon), ID del estilo (Michael Kors) o modelo base sin color (Marc Jacobs: `H004L01PF21`). **Vacía en Sephora**: el sistema la saca del link |
| `condicion` | `Reacondicionado` si el título dice *Renewed* / *Refurbished*; si no, `Nuevo`. **Revísala.** |
| `link` | Amazon: `https://www.amazon.com/dp/<ASIN>`. Michael Kors: el link del producto, terminado en `/<ID>.html`. Sephora: `…/product/<nombre>-P<ID>?skuId=<SKU>`. Marc Jacobs: el link del producto sin parámetros (solo referencia: el sistema no lo lee) |
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
| `ref_nombre` / `ref_marca` / `ref_precio` | Nombre, marca y precio que muestra el sitio, solo como referencia |
| `ref_sku_id` | Sephora: el `skuId` del link (en las demás tiendas queda vacía) |
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
- **▸** despliega el **resumen de esa extracción**: sitio, categoría, páginas, productos, sin imagen, sin precio, anuncios omitidos, avisos y fecha. Los grupos extraídos con versiones anteriores no tienen resumen.
- **🗑** elimina ese grupo y sus productos, después de confirmar. También quita su página del historial, para poder extraerla de nuevo sin aviso. Los demás grupos no cambian. **Limpiar** sigue borrando toda la lista.
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
