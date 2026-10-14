# Guía de uso

## Flujo normal

1. Abre en un sitio disponible una **búsqueda**, una **categoría**, una **tienda de marca** o la **página de un producto**. Sitios disponibles: **Amazon.com**, **Michael Kors** (`www.michaelkors.com`), **Sephora** (`www.sephora.com`), **Marc Jacobs** (`www.marcjacobs.com/us-en/`) y **Kate Spade** (`www.katespade.com`).
2. Pulsa el icono de la extensión → **Extraer productos**. El título del popup indica el sitio (*Amazon Product Scraper*, *Michael Kors Product Scraper*, *Sephora Product Scraper*, *Marc Jacobs Product Scraper*, *Kate Spade Product Scraper*). Desde la v1.12.0, el icono de la barra también cambia: muestra el logo del sitio dentro de un marco naranja. En otra página, el icono es la bolsa naranja, el popup se llama *COMPRAFACIL Scraper* y muestra los sitios disponibles con su logo y su enlace.
3. Si esa página **ya se extrajo antes**, aparece un aviso con la fecha, la categoría y los productos. Elige:
   - **Reemplazar datos anteriores**: quita de la lista los productos y el grupo de la extracción anterior y la hace de nuevo desde cero.
   - **Cancelar**.
4. Elige la **categoría** de los productos (ver abajo).
5. Revisa el **nombre del grupo** (ver abajo) y pulsa **Extraer**.
6. La extensión carga los productos y los añade a la lista: en Amazon lee la página y las siguientes; en Michael Kors, Marc Jacobs y Kate Spade descarga los productos que traerían **Load More** o el scroll, y en Sephora baja la página y pasa de página, hasta el límite indicado (ver *Límite de la extracción*). **No cierres el popup mientras trabaja.**
7. Repite con otras páginas, también de otro sitio: un mismo Excel puede tener productos de Amazon, Michael Kors, Sephora, Marc Jacobs y Kate Spade, cada fila con su `ecomerce`. La lista acumula productos sin repetir SKU: si un SKU ya estaba en otro grupo, se queda con los datos y el grupo de la última extracción.
8. Opcional: pulsa **Vista previa** para revisar las filas del Excel antes de descargarlo (ver *Vista previa del Excel*).
9. Al terminar, pulsa **Descargar Excel**. Opcionalmente escribe un nombre, por ejemplo `Audifonos Hyperx`, y pulsa **Descargar**.
   - Resultado: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`
   - Sin nombre: `Plantilla_Scraping_2026-09-30_14-35.xlsx`
   - Si hay productos de Amazon o Kate Spade sin familia verificada, antes se verifica su familia en segundo plano (ver *Amazon: un producto por familia* y *Kate Spade*) y el Excel se descarga solo al terminar.
10. Pulsa **Limpiar** para empezar una lista nueva. También se borran los grupos.

## Página de un producto

En la página de un solo producto de Amazon (`/dp/…` o `/gp/product/…`) se extrae **solo ese producto**: los carruseles de sugerencias, "productos relacionados" y accesorios se ignoran. Se capturan los mismos datos que en una búsqueda: ASIN de la variante que se ve en pantalla, nombre, marca, precio e imagen. Si el producto no tiene precio, se extrae igual sin precio. En esta página no se desplaza la página automáticamente.

## Extracciones en segundo plano y cola

- **Duración:** el resumen (*"Duración: 1 min 20 s"*) y la notificación dicen cuánto tardó la extracción. Solo cuenta el trabajo: no la espera en la cola, ni el tiempo que la pregunta *¿Seguir?* espera tu respuesta, ni la pausa de Sephora con la pestaña oculta. La exportación con verificación de familias también muestra su duración.

- Al pulsar **Extraer** la extracción empieza y **puedes cerrar el popup o ir a otra página**: sigue sola. Al terminar aparece una **notificación de Chrome** (al pulsarla se abre la pestaña de la extracción) y el icono muestra **✓**. Mientras trabaja, el icono muestra el avance (`2/5` páginas, o el número de productos).
- **Una a la vez, con cola:** si ya hay una en curso, la nueva queda **en cola** y empieza sola cuando termine la anterior. Así puedes dejar una extracción de varias páginas y mientras tanto ir buscando otras páginas para añadir.
- Al abrir el popup ves la extracción en curso (*"Página 3 de 5 · 174 productos"*), con **Ir a la pestaña** y **Detener y guardar lo leído**, y debajo la cola, con **✕** para quitar una.
- **No cierres la pestaña** de la extracción. Si se cierra, o la página cambia, se guarda lo leído hasta ese momento, con un aviso en su resumen, y sigue la cola. Si la pestaña de una extracción en cola ya no está en esa página, se abre la página en una pestaña nueva en segundo plano.
- **Pausa:** las búsquedas de Sephora solo se leen con la pestaña a la vista (Sephora dibuja los productos al bajar). Si cambias de pestaña, esa extracción se **pausa** (icono **⏸**, y el popup dice *"vuelve a la pestaña de Sephora para continuar"*) y sigue sola al volver. Amazon, Michael Kors y las categorías y marcas de Sephora se leen en segundo plano, sin necesidad de ver la pestaña.
- Una misma página no puede estar dos veces en la cola.

## Límite de la extracción

En los listados con varias páginas (búsquedas y categorías de Amazon, Michael Kors, Sephora, Marc Jacobs y Kate Spade) el formulario muestra **Límite de la extracción**, con dos modos (en Marc Jacobs y Kate Spade, solo **Productos**: cargan más al bajar). Se usa uno a la vez:

- **Páginas** (modo inicial, con **1**): **1 = solo la página actual**. Con más, sigue con las siguientes. Se cuenta desde la página abierta: en `currentPage=3` con 2 páginas se extraen la 3 y la 4, y el popup lo indica (*"Páginas a extraer: 3 a 4"*). Máximo **10** páginas por extracción. Entran todos los productos de esas páginas.
  - Sephora: cada página es una `currentPage` (unos 60 productos, sin anuncios).
  - Amazon: cada página es una página de resultados (unos 48 sin anuncios).
  - Michael Kors: la página actual son los 24 productos visibles, y cada **Load More** cuenta como una página más (24).
- **Productos**: hasta ese número de productos (máximo 500), pasando de página lo que haga falta. En **Amazon** (con variantes) y **Kate Spade** cuenta **familias** (ver *Amazon: un producto por familia*): si ya se analizaron tantos productos como el número pedido pero hay menos familias, la extracción se pausa y pregunta.

Se recuerdan **por sitio** el modo y el número. Durante la carga verás *"Cargando página 2 de 3… 84 productos"*, y el resumen dice *"Páginas extraídas: 2 de 2 (de la 3 a la 4)"*. Las páginas sin más páginas (producto, tienda de marca y portada de categoría de Amazon) se extraen enteras, sin este campo.

## Amazon: listados

- **Búsqueda** (`/s?k=…`) y categorías con resultados (`/s?…rh=n:…`): la extensión lee la página abierta y, si el límite pide más, descarga las páginas siguientes (**Siguiente**) en segundo plano, sin cambiar la pestaña. Verás el avance.
- Si una página siguiente no carga o no trae productos nuevos (por ejemplo, Amazon pide verificar que no eres un robot), se extrae lo ya leído y el resumen lo avisa.
- **Anuncios** (*Patrocinado* / *Sponsored*): no se extraen. Si el mismo producto aparece también como resultado normal, sí entra. El resumen dice cuántos anuncios se omitieron.
- **Portada de categoría** (`/b?node=…`, la que muestra carruseles por tema): se extraen los productos de todos los carruseles visibles. Mezcla temas (por ejemplo tarjetas de regalo o fundas): si quieres solo una parte, entra en su **Ver más** y extrae esa lista.
- **Tienda de marca** (`/stores/…`, también con `/-/es/` en la URL): la marca de la tienda se toma como marca de los productos.

## Amazon: un producto por familia

Desde la v1.10.1, **solo en los grupos con *Extraer variantes*** (ver *Opciones del grupo*). Una **familia** son todas las variantes (colores, tallas, capacidades…) que Amazon agrupa bajo un mismo producto padre. Con `variacion = Sí`, el sistema descarga la familia completa de cada ASIN del Excel, así que dos ASIN de la misma familia la crearían dos veces. Por eso la extensión deja **un solo producto por familia**: el **primero que aparece en la página**.

Sin *Extraer variantes* (`variacion = No`), el sistema crea solo cada ASIN, sin su familia: entonces se extraen **todos** los ASIN y no se verifican familias (sin descargas extra ni pregunta).

- **Cómo lo sabe:** la familia no se ve en los listados. Para cada producto, la extensión descarga en segundo plano su página `/dp/` y lee el padre y la lista de variantes. Las variantes que ya conoce no se vuelven a descargar. Entre descarga y descarga hay una pausa de 1,5 a 3 segundos para que Amazon no pida verificación, así que **tarda más que antes** (unos 2 a 3 segundos por familia). Funciona con la pestaña oculta.
- Se respeta el criterio de Amazon: dos productos que se ven iguales pero que Amazon publica con padres distintos son **familias distintas**. Un producto sin variantes es su propia familia.
- En la **página de un producto** la familia se lee de la misma página, sin descargas.
- **Familia que ya está en la lista** (de una extracción anterior con variantes): el producto nuevo se omite y el resumen dice en qué grupo está su familia. Si es el **mismo ASIN**, pasa al grupo nuevo, como siempre.
- **Límite por productos:** cuenta familias. Si se analizaron tantos productos como el número pedido pero hay menos familias, la extracción se **pausa** (icono **⏸**) y pregunta, en el popup y en una notificación de Chrome: *"Se analizaron 60 productos y hay 48 familias. ¿Seguir…?"*.
  - **Seguir:** continúa con las páginas siguientes hasta tener ese número de familias. Si llega al máximo de 10 páginas o no hay más páginas, se detiene y lo avisa (no vuelve a preguntar).
  - **Detener y guardar:** guarda las familias que ya tiene.
  - Espera sin límite de tiempo hasta que respondas.
- **Límite por páginas:** no pregunta. Entran las familias de esas páginas.
- **Resumen:** *"Productos analizados: 25 · Familias: 19"* y *"Omitidos por familia repetida (se conservó el primero de la página): 6"*.
- **Si no se puede leer la familia** (error de red o Amazon pide verificar que no eres un robot), el producto **se conserva** con el aviso *Familia sin verificar* en `ref_duplicado`. Tras una verificación (CAPTCHA) la extensión deja de descargar páginas para no empeorarlo; resuélvela en amazon.com antes de exportar.
- **Al descargar el Excel**, los productos de Amazon de grupos con variantes que no tienen familia (sin verificar) se verifican antes, con las mismas pausas. Esa exportación corre en segundo plano (*"Exportando el Excel · Verificando 7 de 19"*), puedes cerrar el popup y el Excel se descarga solo. **Detener y exportar lo verificado** la corta y descarga con lo que haya. En el Excel queda un producto por familia: gana el que se agregó primero a la lista, y el resumen lista los omitidos.

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

## Kate Spade

Desde la v1.11.0.

- Solo la tienda de **EE. UU.** (`www.katespade.com`). El **outlet** (`surprise.katespade.com`) no se extrae. Desde otra región (por ejemplo `katespade.co.uk` o `katespade.jp`) el popup ofrece **Abrir en www.katespade.com**: busca en EE. UU. el texto buscado, o abre la portada (los códigos de otros países no sirven aquí).
- **Listados** (categorías con o sin filtros y búsquedas `/search?q=…`): la página muestra 16 productos y carga más al bajar, cambiando la URL a `?page=2`, `?page=3`… La extensión descarga las páginas siguientes en segundo plano, sin bajar por la página ni necesitar verla. Si abres `?page=3`, ya tiene los productos de las páginas 1 a 3 y sigue con la 4. El límite es **solo por productos** (50 por defecto, máximo 500).
- **Página de producto** (`/products/<nombre>/<estilo>-<color>.html`): se extrae solo ese producto, con el precio de venta. No se pide el máximo.
- **SKU:** el sistema solo lee la columna `sku` y la corta en el primer `-`. La extensión escribe el **estilo** (`KD120-960` → `KD120`): los colores del mismo estilo son una sola fila.
- **Un producto por familia, siempre** (con o sin *Extraer variantes*): una familia de Kate Spade reúne varios estilos (por ejemplo `KN974`, `KN975`, `KO584`, `KO585` y `KP497` son la misma cartera con otros colores o estampados), y el sistema crearía cada estilo como un producto aparte. Por eso la extensión deja **el primero que aparece en la página**.
  - **Cómo lo sabe:** descarga en segundo plano la página de cada producto y lee sus variantes. Los estilos que ya conoce no se vuelven a descargar. Pausa de 1,5 a 3 segundos entre descargas, como en Amazon: **tarda más** (unos 2 a 3 segundos por familia).
  - Igual que en Amazon: la pregunta *¿Seguir…?* si hay menos familias que el límite, el aviso de familia ya en la lista (con su grupo), *Familia sin verificar* si no se pudo leer (se reintenta al exportar) y un producto por familia en el Excel.
  - Si Kate Spade bloquea las descargas (*Access Denied*), la extensión deja de descargar y el resumen lo avisa: espera unos minutos y exporta (las que falten se verifican al exportar).
- **Precio** (solo referencia): el de venta; en un rango (*$88 - $110*) el menor.
- **Imagen:** la de la tarjeta; si la tarjeta aún no la cargó, se arma desde el link (`…/KateSpade/KD120_960`).
- No hay anuncios en los listados. Los banners entre los productos no se extraen.
- El nombre del grupo por defecto es el texto buscado (*wallet*) o el título de la página sin "| kate spade new york".

## Nombre del grupo

Cada vez que pulsas **Extraer** se crea un **grupo** con los productos de esa extracción. Su nombre sale en la columna `ref_grupo` del Excel, para distinguir las extracciones dentro del archivo unificado.

- Por defecto se propone el **título de la página** recortado (por ejemplo *hyperx headset* o *Apple AirPods Pro (2ª generación)*). Puedes cambiarlo antes de extraer.
- **No se permiten dos grupos con el mismo nombre** (sin distinguir mayúsculas ni tildes). Si el título ya existe, se propone con un número: *hyperx headset (2)*.
- El nombre del grupo **no** cambia el nombre del archivo Excel.

## Opciones del grupo: variantes y guía de tallas

Desde la v1.10.1, el formulario de **Extraer** tiene dos casillas. *Extraer variantes* empieza **desmarcada** en Amazon y Sephora y, desde la v1.14.4, **marcada** en Michael Kors, Marc Jacobs y Kate Spade (al desmarcarla ahí pide confirmación: *Desactivar* / *Mantener*). Desde la v1.14.3, *Guía de tallas* empieza **marcada**:

- **Extraer variantes** → `variacion = Sí` en todas las filas del grupo (el bot extrae todas las variantes y agrupa la familia). Desmarcada → `No` (solo ese producto). En Amazon también decide si se deja un producto por familia (ver *Amazon: un producto por familia*). En Kate Spade no cambia eso: siempre se deja uno por familia.
- **Guía de tallas** → `guia_talla = Sí`; desmarcada → `No`. Al desmarcarla, el popup pide confirmar (**Desactivar** / **Mantener**); volver a marcarla no pregunta.

*Extraer variantes* se elige **al extraer y no se cambia después** (tampoco en la vista previa, donde *Con variantes* / *Sin variantes* es solo una etiqueta): la extracción depende de ella (con variantes, Amazon verifica familias). Si te equivocaste, elimina el grupo (🗑) y extrae de nuevo. *Guía de tallas* sí se puede cambiar después, desde la **vista previa** (botón en la cabecera de cada grupo; ver *Vista previa del Excel*). Se ven siempre en la lista, debajo del nombre del grupo (*Variaciones: Sí*, *Guía de tallas: No*), y en la primera línea de su resumen. Si un producto se vuelve a extraer en otro grupo, toma las opciones del grupo nuevo. Los grupos extraídos con versiones anteriores quedan con `No` en ambas.

## Elegir la categoría

Hay dos formas. La extensión recuerda la última que usaste.

**🔍 Buscar:** escribe cualquier parte del nombre o el código.
- `ollas` → *Hogar / Menaje de Cocina / Juegos de ollas*
- `zapatillas mujer` → *Calzado / Calzado para Mujer / Zapatillas Deportivas*
- `CF0101` → todas las de Hogar / Menaje de Cocina

No distingue tildes ni mayúsculas, y las palabras pueden ir en cualquier orden. Usa ↑ ↓ para moverte y **Enter** para elegir; **Enter nunca inicia la extracción**, solo el botón **Extraer**. Desde la v1.14.4, en el popup el campo empieza **vacío** (no propone la categoría anterior ni la última usada) y la lista aparece solo al escribir; con el campo vacío, **↓** muestra las categorías usadas recientemente. En la vista previa, con el campo vacío aparecen las usadas recientemente.

**☰ Por niveles:** elige **Principal → Secundaria → Terciaria**. Cada lista muestra solo las opciones del nivel anterior.

Al elegir, debajo aparece el **código** (por ejemplo `Código: CF130704`).

**No llenar categoría:** si no quieres elegir la categoría ahora (por ejemplo, la página mezcla productos de varias categorías), marca esta casilla. `Buscar categoria` y `codigo_categoria` quedan vacías para elegirlas fila por fila con el desplegable de la plantilla. Empieza siempre desmarcada.

**↻ Actualizar:** vuelve a descargar la lista de categorías. Úsalo si acaban de crear una categoría en el sistema.

## El Excel

Es la **plantilla de scraping del sistema** (`Plantilla_Scraping_General.xlsx`) ya llenada: mismas columnas, desplegables y colores. Se sube tal cual al sistema; el bot de scraping extrae el resto de datos.

**Lo que llena la extensión:**

| Columna | Valor |
|---|---|
| `ecomerce` | `Amazon`, `MichaelKors`, `Sephora`, `MarcJacobs` o `KateSpade`, según el sitio de cada producto (desde la v1.14.4 sin espacios; la vista previa muestra el nombre con espacios, salvo en *Ver datos técnicos*) |
| `sku` | Solo Amazon: el ASIN. **Vacía en los demás sitios** (desde la v1.13.0): el sistema saca el SKU del link. La vista previa, con *Ver datos técnicos*, muestra como referencia el estilo o el `skuId` |
| `condicion` | `Reacondicionado` si el título dice *Renewed* / *Refurbished*; si no, `Nuevo`. **Revísala.** |
| `link` | **Vacía en Amazon** (desde la v1.13.0): el sistema usa el `sku`. Michael Kors: el link del producto, terminado en `/<ID>.html`. Sephora: `…/product/<nombre>-P<ID>?skuId=<SKU>`. Marc Jacobs y Kate Spade: el link del producto (el sistema saca el SKU de aquí) |
| `Buscar categoria` | Ruta de la categoría elegida en el popup (vacía con *No llenar categoría*) |
| `codigo_categoria` | Código de esa categoría. Es una fórmula: si cambias `Buscar categoria`, se actualiza sola |
| `seguimiento` | `Scraping` |
| `variacion` / `guia_talla` | `Sí` o `No`, según las opciones del grupo (ver *Opciones del grupo*) |

**Orden de las columnas** (desde la v1.10.1): `ecomerce`, `sku`, `variacion`, `guia_talla`, `condicion`, `link`, `Buscar categoria`, `codigo_categoria`, `seguimiento`, las columnas de ayuda `ref_*` y al final, a la derecha, las que llena el bot (`marca`, `nombre`, `categoria_general`, `color`, `talla`, `tipo_sku`, `cantidad_imagen`, `peso`, `precio`). El sistema lee las columnas por nombre, así que el orden no le afecta.

**Columnas que quedan vacías:** `marca`, `nombre`, `categoria_general`, `color`, `talla`, `tipo_sku`, `cantidad_imagen`, `peso` y `precio`. Las llena el bot: si se llenan a mano, el sistema las toma como valores fijos.

**Columnas de ayuda** (después de `seguimiento`; el sistema las ignora):

| Columna | Para qué |
|---|---|
| `ref_grupo` | Nombre del grupo (la extracción) de donde salió el producto. Las filas salen ordenadas por grupo, en orden de extracción |
| `ref_imagen_link` | URL de la imagen |
| `ref_imagen` | Vista previa con `=IMAGE()`. Funciona en **Google Sheets** (en LibreOffice o Excel antiguo muestra `#NAME?`) |
| `ref_nombre` / `ref_marca` / `ref_precio` | Nombre, marca y precio que muestra el sitio, solo como referencia |
| `ref_sku_id` | Sephora: el `skuId` del link (en las demás tiendas queda vacía) |
| `ref_duplicado` | `Posible variante: fila N` cuando otra fila tiene el mismo nombre o la misma imagen. Suele ser otro color o talla del mismo producto: deja una sola fila y marca `variacion = Sí`. Amazon y Kate Spade: `Familia sin verificar` si no se pudo leer su familia (puede ser de la misma familia que otra fila; revísala antes de subir) |

**Para que la carga no pierda filas:**
- Sube el archivo como **.xlsx** (en Google Sheets: *Archivo → Descargar → Microsoft Excel*). **Nunca como CSV**: en CSV las celdas vacías llegan como texto vacío y el sistema descarta esas filas sin avisar.
- **Celdas en rojo** (formato condicional de la plantilla, desde la v1.14.3): en Amazon, `sku` vacío o `link` lleno; en los demás sitios, `link` vacío o `sku` lleno. Amazon va solo con `sku` y el resto solo con `link`. Al seleccionar una celda de `sku` o `link`, un mensaje recuerda la regla.
- No dejes un `sku` "vacío" con un espacio o con una fórmula que devuelva `""`: el sistema descarta la fila sin avisar. Para quitar un producto, borra la fila entera.
- No uses guiones en `sku`: el sistema corta el valor en el primer `-`.
- El sistema solo **crea** productos: si un SKU ya existe, la fila se ignora (no se actualiza).
- `Plantilla` debe seguir siendo la **primera** pestaña.

## Vista previa del Excel

Desde la v1.12.0 (rediseñada en la v1.14.0 para quien revisa el contenido). **Vista previa** (junto a *Descargar Excel*) abre una pestaña con los productos que tendrá el Excel, calculados igual que el archivo: mismo orden, un producto por familia y sin los productos sin SKU. Desde ahí también se pueden **quitar productos** de la lista (ver abajo). Usa los colores de COMPRAFACIL y se ve igual con el tema claro u oscuro del navegador.

- **Barra superior:** buscador (nombre, marca, SKU o link; también encuentra el ASIN o el color de una variante guardada), filtro por grupo y por sitio (si hay más de uno). Debajo, en azul, el **nombre del archivo** (campo de ancho fijo; debajo, *Se guardará como*, cortado con … si es largo y completo al pasar el ratón) y **Descargar Excel** (la misma descarga que el popup), siempre visibles.
- **Resumen:** el **estado** en palabras (*Todo listo para descargar*, o *N productos para revisar*; al pulsarlo se abre esa pestaña), los productos que van al Excel (de cuántos hay en la lista), las **variantes que creará el sistema** (si se conocen todas) y los que **no irán al Excel**. Debajo, en chips, el detalle: familias en el Excel, omitidos al extraer o por familia repetida, sin SKU, familia por verificar o sin verificar, sin categoría, posibles variantes, reacondicionados, SKU con guion (solo los que no son cero).
- **Pestañas:** *Todos*, *⚠ Para revisar* (solo los productos con avisos) y *No irán al Excel* (solo aparece si hay alguno). Los filtros de la barra valen en las tres. Con un sitio elegido, el filtro de grupos muestra solo los grupos con productos de ese sitio.
- **Productos por grupo:** cada grupo tiene una cabecera azul con su nombre, sus opciones (*Con variantes* / *Sin variantes*, *Con guía de tallas* / *Sin guía de tallas*; desde la v1.14.3 este último es un botón que activa o desactiva la guía de tallas de todo el grupo: desactivarla pide confirmar, activarla no; cambia `guia_talla` en el Excel y la línea de opciones del resumen del grupo; no se puede mientras se exporta), cuántos productos tiene y cuándo se extrajo. Cada producto es una tarjeta con su imagen, nombre, sitio, marca, precio, condición, categoría (o *Sin categoría*), el estado **✓ Listo** o **⚠ Revisar** y, si tiene, su familia o variantes. Los avisos se explican con lo que conviene hacer (por ejemplo *Falta la categoría. Elígela en la plantilla después de descargar.*; *Mismo nombre que otro producto* nombra cuál: si es otro modelo, se deja). *Ver en Amazon ↗* (o el sitio) abre el producto.
- **Vista de cada grupo** (botones ▬ ☰ ▦ a la derecha de su cabecera azul): **comprimido** (solo la cabecera, con cuántos tiene *para revisar*), **resumido** (por defecto: los 3 primeros productos, en el mismo orden que la vista completa, y *▾ Ver los N productos restantes*) y **completo** (todos, con *▴ Resumir*). *Vista de los grupos…* (junto a *Ver datos técnicos*) comprime, resume o expande todos a la vez. La vista de cada grupo se recuerda en ese navegador. Al cambiar la vista de un grupo se cierran los desplegables de variantes y tallas de ese grupo (los de otros grupos no cambian). Al buscar, los grupos muestran todas sus coincidencias.
- **Asignar categoría** (desde la v1.14.0), con el mismo buscador que el popup (**🔍 Buscar** o **☰ Por niveles**, **↻ Actualizar**, usadas recientemente primero): en la tarjeta, la categoría (o *Sin categoría · Asignar ✎*) abre el buscador para ese producto; en la cabecera del grupo, **🏷** (muestra la categoría común, *Varias categorías* o *Asignar categoría*) la asigna a todos sus productos (también a los que no irán al Excel), y con productos seleccionados, **🏷 Asignar categoría (N)** en la barra de selección. Si algún producto ya tiene otra categoría, siempre se confirma antes de cambiarla: un producto, *¿Cambiarla por …?*; varios (grupo o selección), lista las categorías actuales y ofrece *Cambiar a todos* o *Solo a los N sin categoría*. **✕ Quitar categoría** (en el buscador, si hay alguna asignada) deja los productos sin categoría, también después de confirmar. Solo se aceptan categorías de la lista (con código). El Excel sale con `Buscar categoria` y `codigo_categoria` llenos; el aviso verde ofrece *Deshacer* y se cierra con **✕**. El resumen del grupo en el popup pasa a decir esa categoría (o *varias*). No se puede mientras se exporta.
- **Ver datos técnicos** (interruptor, apagado al empezar; se recuerda en ese navegador): muestra en cada tarjeta su **fila del Excel** como en una hoja de cálculo: número de fila (la 1 es el encabezado) y las columnas que lee el sistema en el orden de la plantilla (`ecomerce`, `sku`, `variacion`, `guia_talla`, `condicion`, `link`, `Buscar categoria`, `codigo_categoria`, `seguimiento`). Las celdas vacías dicen *vacía* y, al pasar el ratón, por qué (en Amazon el `link` va vacío porque el sistema usa el `sku`; en los demás sitios el `sku` va vacío porque el sistema lo saca del link). Debajo, *Solo referencia*: `ref_grupo`, `ref_duplicado`, el `skuId` o estilo del link, la familia y los avisos. En las miniaturas de variantes muestra el SKU o ASIN (al pasar el ratón, de qué familia o color es).
- **Variantes de la familia** (desde la v1.13.0): en un producto que representa a su familia (Amazon en grupos con *Extraer variantes*, Kate Spade), **▸ Ver N variantes** (cerrado al abrir la página) despliega dentro de la tarjeta una miniatura por variante: imagen (abre esa variante), atributos (color, talla…) y precio si se conoce; con *Ver datos técnicos*, también su SKU o ASIN. El grupo, la categoría, las opciones y la condición son los del producto (el sistema los aplica a toda la familia). La variante que va al Excel dice *Va al Excel*. En Amazon, si la familia varía en algo que no cambia la foto (ropa: talla y color), se agrupa: una miniatura por color o modelo, con su imagen, cuántos ASIN tiene y sus tallas como chips (cada chip abre ese ASIN; el que va al Excel, en naranja). **Muchas tallas o colores** (desde la v1.14.0): las tallas de todo el producto se resumen una vez bajo el título (*Tallas: X-Small a 3X-Large (7)*, o *29W–42W · 30L–36L* en pantalones). Un color con más de 6 tallas no muestra chips sino un resumen (*36 tallas* y debajo el rango, o *sin …* si le faltan pocas; *Va al Excel: 32W x 32L* en el que va al Excel) y **▸ Ver tallas**, que abre debajo el detalle de ese color: en tallas de dos medidas (cintura × largo, `29W x 30L`) una tabla con ● en cada talla que existe (abre ese ASIN; naranja la que va al Excel, atenuada la agotada) y · en la que no existe en ese color; en las demás, los chips. Se abre un solo detalle de tallas a la vez en toda la página: abrir otro cierra el anterior. Con más de 14 colores (o variantes) se ven los primeros 14, siempre con el que va al Excel, y **▾ Ver los N colores** muestra el resto. Si un color con su tabla está abierto, el detalle aparece justo debajo de la fila de ese color, en azul y con una flecha hacia él. Los nombres de las dimensiones de Amazon (que la página trae en inglés) se muestran en español: *Color* colores, *Style* estilos, *Size* tallas, *Special Size Type* tipos de talla, *Pattern Name* diseños, *Flavor* sabores, *Scent* aromas, *Capacity* capacidades, *Material* materiales, *Configuration* configuraciones, *Item Package Quantity* cantidades; si cada miniatura combina varias (por ejemplo tipo de talla y color) o el nombre no se conoce, se habla de *opciones* (*37 opciones: tipo de talla y color*). Si todo cambia la foto (por ejemplo color y capacidad), una fila por variante. Amazon no trae nombre ni precio de cada variante (solo los de la variante abierta); Kate Spade sí. Las variantes no van al Excel: el sistema crea la familia desde el producto. Lo extraído antes de la v1.13.0 no guardó sus variantes: **Cargar variantes** las lee de la página del producto (una descarga, sin cambiar la lista). **Kate Spade** (grupos con *Extraer variantes*): también se buscan solas de la página del producto y se agrupan por color con las tallas en chips (ropa) o se listan por color (carteras); si la familia reúne varios estilos, cada color lleva su estilo. **Marc Jacobs** (grupos con *Extraer variantes*): también se buscan solas, agrupadas por color con sus tallas; como cada página trae solo las tallas de su color, se descarga una página por color (un producto de 3 colores son 3 descargas, con la misma pausa). Las tallas agotadas se ven tachadas; *Va al Excel* marca el color del link. **Michael Kors** (grupos con *Extraer variantes*): igual que Sephora, sus colores y tallas se buscan solos de la página de cada producto (`ProductGroup` del JSON-LD) y se muestran agrupados por color, con la imagen, el precio y las tallas en chips (cada chip abre esa talla). **Sephora** (grupos con *Extraer variantes*): el sistema crea todos los tonos o tamaños del producto; se buscan solos al abrir la vista previa, uno a uno con una pausa de 1,5–3 s (la tarjeta dice *Buscando variantes…* y luego *▸ Ver N variantes* o *Sin variantes*; el resumen muestra *Buscando las variantes de N productos* y, al terminar, las suma a *Variantes que creará el sistema*). Lo leído se recuerda 7 días, así que al volver a abrir la vista previa no se descarga de nuevo. Al desplegar se ven con imagen, tono, tamaño, precio y `skuId`; el que va al Excel es el `skuId` del link. Si Sephora bloquea una descarga, la búsqueda se detiene: ese producto muestra *Reintentar* y los demás *Buscar variantes*. La lista no cambia. Los grupos sin variantes no tienen desplegable.
- **No irán al Excel:** los productos que la exportación deja fuera y el motivo en palabras (*Es variante de «…», que sí va al Excel*, o *Le falta el código*; el motivo original al pasar el ratón). Si no hay ninguno, lo dice.
- **Familia por verificar:** productos de Amazon (grupos con variantes) o Kate Spade cuya familia todavía no se conoce. Se verifica al descargar, así que el Excel puede tener menos filas que la vista previa (lo avisa una nota bajo el resumen).
- La vista se actualiza sola si cambia la lista, por ejemplo al terminar una extracción.
- En el popup, el resumen de un grupo (**▸**) tiene el enlace *Ver sus productos en la vista previa*, que la abre filtrada por ese grupo.

**Quitar productos:**
- **Quitar** en una tarjeta quita ese producto de la lista (también en *No irán al Excel*), después de confirmar.
- **Selección:** cada tarjeta tiene su casilla y cada grupo una en su cabecera, que marca todos los productos del grupo en esa pestaña y con los filtros (también los que no se ven por estar resumido o comprimido). *Seleccionar todos (N)* marca todos los de la pestaña con los filtros. Con algo marcado aparece abajo una barra con **🏷 Asignar categoría (N)**, **Quitar (N)** y **✕ Limpiar selección**. Después de asignar o quitar, la selección se limpia. Siempre se pide confirmación antes de quitar.
- **Familias:** en Amazon (grupos con variantes) y Kate Spade, cada producto representa a su familia: el sistema crea todas las variantes a partir de ese producto. La confirmación lo avisa, con el tamaño de la familia y cuántos de ella se omitieron al extraer (solo en extracciones hechas con la v1.12.0 o posterior). Esos omitidos no están en la lista, así que al quitar al representante **no se crea ninguna variante de esa familia**.
- Si otro producto de la misma familia **sí está en la lista** (en *No irán al Excel*), se pregunta: **Quitar solo este** (entra ese otro en su lugar) o **Quitar la familia completa**.
- **Deshacer:** tras quitar, el aviso verde ofrece *Deshacer*, que devuelve los productos a su grupo y a su lugar. Vale para el último cambio.
- Mientras se **exporta** (verificando familias) no se puede quitar nada.
- El grupo conserva su resumen y suma la línea *Quitados a mano en la vista previa: N*. Un grupo que queda vacío se conserva (se elimina con 🗑 en el popup).
- Los productos quitados **no se recuerdan**: si vuelves a extraer la página con *Reemplazar datos anteriores*, vuelven.

## Panel de la lista

Debajo del botón principal verás cuántos productos hay en la lista y los grupos, por ejemplo *"hyperx headset · 24 productos ↗"*.

- **Doble clic en el nombre** para renombrar el grupo. **Enter** o salir del campo guarda; **Esc** cancela. Un nombre vacío o repetido no se acepta.
- **↗** abre la página de donde salieron los productos.
- Debajo del nombre, las **opciones del grupo** (*Variaciones: Sí/No*, *Guía de tallas: Sí/No*), en verde si están activas.
- **▸** despliega el **resumen de esa extracción**: opciones del grupo, duración, sitio, categoría, páginas, productos, sin imagen, sin precio, anuncios omitidos, avisos y fecha. Los grupos extraídos con versiones anteriores no tienen resumen. Debajo, *Ver sus productos en la vista previa*.
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
