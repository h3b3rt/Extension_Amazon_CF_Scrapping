# Pendientes y próximos pasos

Estado al **07/10/2026**.

- **Publicada: v1.12.1** (07/10/2026, corrección): Sephora, páginas de producto de un solo SKU (sin tonos ni tamaños, p. ej. calendarios de adviento) no extraían nada: la página no trae `data-cnstrc-item-variation-id`; ahora el `skuId` se lee de "Item 3031002" (`variantChild`).
- v1.12.0 (06/10/2026): icono por sitio (logo del sitio en un marco naranja, en la barra y en el popup) y **vista previa** del Excel en una pestaña, con la opción de quitar productos antes de descargar (sección 7).
- v1.11.0 (06/10/2026): Kate Spade (solo `www.katespade.com`, sin el outlet; un producto por familia siempre, leída del JSON-LD de cada producto; páginas siguientes del scroll infinito descargadas en segundo plano; límite solo por productos; botón a EE. UU. desde otra región). Familias generalizadas a cualquier sitio.
- v1.10.1 (03/10/2026, correcciones): Amazon, un producto por familia (sección 6); opciones del grupo *Extraer variantes* y *Guía de tallas* (`variacion`/`guia_talla` = Sí/No, fijas desde la extracción; sin variantes no se verifican familias); columnas vacías del backend al final del Excel; duración de la extracción en el resumen y la notificación.
- v1.10.0 (02/10/2026): Marc Jacobs (solo `/us-en/`; una fila por modelo; categorías y búsquedas con carga en segundo plano; botón a EE. UU. desde otra región).
- v1.9.0 (02/10/2026): Sephora; anuncios fuera, páginas siguientes y portada de categoría en Amazon; límite por páginas; extracciones en segundo plano con cola, notificación y "Detener"; resumen desplegable y 🗑 por grupo.

## 1. Categorías automáticas desde la API ✅
- [x] Secrets **`CF_EMAIL`** y **`CF_PASSWORD`** creados en GitHub. Ver [CATEGORIAS.md](CATEGORIAS.md).
- [x] El workflow **Actualizar categorías** inicia sesión y descarga la lista cada 3 horas (ejecuciones correctas desde el 30/09/2026). La lista de la API coincide con la cargada a mano el 29/09/2026, por eso todavía no hubo commit de `categories.json`: se hará solo cuando cambie una categoría.

## 2. Probar en Chrome real
Varias funciones solo se probaron en simulación (jsdom) y con capturas de Chrome sin interfaz:
- [x] Buscador de categorías y modo **Por niveles**.
- [x] Botón **↻ Actualizar** categorías.
- [ ] Historial sincronizado entre dos PCs con la misma cuenta de Google.
- [ ] Extracción en una tienda de marca con **EditorialTile**.
- [x] **v1.6.0:** abrir el Excel descargado en **Google Sheets** y revisar la vista previa `ref_imagen`, el desplegable de `Buscar categoria` y que `codigo_categoria` cambie al elegir otra ruta.
- [x] **v1.7.0:** extracción en Chrome real de búsquedas y de una página de producto: un solo producto (sin sugerencias), con precio y marca. Excel de prueba revisado el 01/10/2026: 80 filas, `ref_grupo` lleno y por bloques, sin celdas `''` ni columnas del backend llenas.
- [x] **v1.7.0:** grupos en el popup: nombrar, separar, renombrar y enlace ↗ a la página original.
- [ ] **v1.7.0:** página de producto **sin precio** ("Currently unavailable") y la marca cuando no hay fila "Marca" (solo `#bylineInfo`, en inglés: "Visit the X Store").
- [x] **v1.8.0:** Michael Kors en Chrome real (comprobado el 01/10/2026): listado con **Load More**, avance en el popup y límite respetado, y páginas de producto.
- [x] **v1.8.0:** título del popup por sitio (*COMPRAFACIL Scraper* fuera de los sitios, con la lista de sitios disponibles).
- [ ] **v1.8.0:** subir al sistema un Excel con filas de Michael Kors y confirmar que se crean con el SKU del link.
- [x] **v1.9.0:** Sephora en Chrome real (02/10/2026): "Show More Products" cambia de página sin recargar, y las categorías y marcas se leen desde los datos de la página.
- [x] **v1.9.0:** Sephora: página de producto con otro tamaño o tono elegido, y el botón **Abrir en www.sephora.com** desde otra región.
- [x] **v1.9.0:** Sephora en Chrome real (02/10/2026): listado con paso de página, sin anuncios.
- [x] **v1.9.0:** extracciones en segundo plano en Chrome real (02/10/2026): popup cerrado y otra pestaña durante la extracción, cola, notificación, icono, "Detener y guardar lo leído", pestaña cerrada a mitad, pausa en una búsqueda de Sephora, desplegable ▸ y 🗑 por grupo.
- [x] **v1.9.0:** al actualizar con el zip de la Release, comprobar si Chrome pide aceptar los permisos nuevos (`sephora.com` y notificaciones) y avisar al equipo.
- [x] **v1.9.0:** límite por páginas en Chrome real (02/10/2026): 1 página, varias páginas desde una que no es la primera, cambio a Productos y valor recordado por sitio.
- [x] **v1.9.0:** Amazon en Chrome real (02/10/2026): búsqueda con más de una página (descarga de las páginas siguientes, sin captcha), anuncios omitidos, portada de categoría `/b?node=` y tienda de marca con `/-/es/`.
- [ ] **v1.9.0:** subir al sistema un Excel con filas de Sephora (sin `sku`) y confirmar que se crean con el `skuId` y el `P…` del link.
- [x] **v1.6.0:** subir un Excel de prueba al sistema (`POST /product/upload/list`) y confirmar que se crean los productos con su categoría y condición.
- [x] **v1.10.1:** familias de Amazon, opciones del grupo, orden de columnas y duración en Chrome real (03/10/2026; ver sección 6).
- [x] **v1.11.0:** Kate Spade en Chrome real (06/10/2026, resultados correctos): categoría con límite mayor que la página (descarga de `?page=N&startFrom=N`: comprobar en el resumen que trae productos nuevos y no repite la página 1), búsqueda, búsqueda con filtros, página de producto (con un color que cambia la URL y otro que no), pregunta *Seguir / Detener*, familia ya en la lista, botón desde otra región, outlet sin extraer y exportación. Ver cuántas descargas seguidas aguanta antes de *Access Denied*.
- [ ] **v1.11.0:** subir al sistema un Excel con filas de Kate Spade y confirmar que crea un producto por estilo con `asin` vacío.
- [x] **v1.12.0:** icono por sitio en Chrome real (06/10/2026): cambia al pasar de una pestaña a otra, vuelve a la bolsa fuera de los sitios (y en el outlet de Kate Spade), se ve bien con el texto del icono (`2/5`, `✓`) y en tema oscuro.
- [x] **v1.12.0:** vista previa en Chrome real (06/10/2026): imágenes de los 5 sitios, enlaces, filtros, *Ver sus productos en la vista previa* desde un grupo, actualización sola al terminar una extracción, descarga desde la pestaña (directa y con familias por verificar), y quitar productos: 🗑, varios seleccionados, familia (solo este / completa), Deshacer, bloqueo durante una exportación y quitar con una extracción en curso.

## 3. Otros ecommerce de la plantilla
La plantilla acepta Amazon, Sephora, Marc Jacobs, Kate Spade y Michael Kors.
- [x] **Michael Kors** (piloto, v1.8.0). El backend toma el SKU de la columna `sku` o, si falta, del link (`/<ID>.html` del pathname; ignora los parámetros). Si ambos vienen, gana `sku`. La extensión escribe los dos y saca el SKU del link, así siempre coinciden. Una fila sin SKU se descarta sin aviso.
- [x] **Sephora** (v1.9.0). El backend (`parseSephoraUrl`) saca del link el `skuId` (sku) y el primer `-<letra><dígitos>` de la ruta (`product_id`, el `P…`). La extensión deja `sku` vacía (llena, borraría el `P…`), arma el link limpio `…-P123?skuId=…`, omite los links sin `skuId` o con otro código antes del `P…`, y deja una fila por `P…` (el SP solo elimina duplicados por sku). El backend no se modifica.
- [x] **Marc Jacobs** (v1.10.0). El backend (`normalizeSku`) solo lee la columna `sku` (ignora el link): corta en el primer `-`, mayúsculas y quita lo que no sea `A-Z0-9`. La extensión escribe ese modelo base como texto, una fila por modelo (primer color), omite los SKU de más de 15 caracteres (`product_id` VARCHAR(15)), solo extrae `/us-en/` (otra región: botón a `/us-en/homepage`), descarga los tramos de `Search-UpdateGrid` (scroll infinito, límite solo por productos) y, con la búsqueda abierta en el panel, ofrece abrir `/us-en/search?q=…`. Probado en Chrome real el 02/10/2026: categoría con tramos, filtro, búsqueda como página, producto, otra región.
- [x] **Kate Spade** (v1.11.0; misma lógica de backend que Marc Jacobs, con `asin = null`). Solo `www.katespade.com` (el outlet `surprise.katespade.com` no; otras regiones: botón a EE. UU.). El sitio no tiene páginas de marca o submarca. La extensión escribe el estilo sin color (`KD120-960` → `KD120`) y deja **un producto por familia, siempre**: una familia reúne varios estilos (`KO585` = `KN974`, `KN975`, `KO584`, `KO585`, `KP497`), que el sistema crearía aparte. La familia sale del JSON-LD (`ProductGroup`) de la página de cada producto, con las pausas de Amazon. Listados con scroll infinito (`?page=N`; `?page=3` trae de la 1 a la 3): se descarga `?page=N&startFrom=N` y, si no trae nada nuevo, `?page=N`. Límite solo por productos (familias). Imagen armada desde el link cuando la tarjeta no la cargó; precio menor en un rango.
  - [x] Pruebas en jsdom (05/10/2026) con los HTML guardados (búsqueda, búsqueda con filtro, categoría, categoría `?page=3`, producto, producto en oferta): familias, páginas siguientes simuladas (solo esa página, lista completa, fin de la lista), bloqueo *Access Denied*, familia ya en la lista, v1.10.1 sin extraer con la config nueva; service worker + popup (límite solo por productos, grupo con y sin variantes, exportación que verifica las familias pendientes) y Excel leído con SheetJS como el backend (`sku` de texto igual tras `normalizeSku`, sin celdas `''`, sin columnas del backend, una fila por familia). Regresión de Amazon, Marc Jacobs, Sephora y Michael Kors.
  - [x] Prueba en Chrome real (06/10/2026; sección 2).
- [x] **Icono por sitio** (v1.12.0, publicada el 06/10/2026): opción elegida el 06/10/2026, el favicon de cada sitio dentro de un marco naranja (`icons/sitios`, `config.sites[].icono`), con `chrome.action.setIcon` por pestaña. Si algún día se publica en Chrome Web Store (sección 4), revisar si los logos de las marcas chocan con su política de suplantación; en ese caso, volver a un distintivo de texto.
- Aviso para el backend (no bloquea): `SP_CreateProductList` solo crea productos nuevos (un SKU existente se ignora) y `p_updated`/`p_created` toman `ROW_COUNT()` de `SP_GenerateUpc`, así que el conteo que devuelve no es fiable.

## 4. Publicar en Chrome Web Store (recomendado)
Instalación con un clic y actualizaciones automáticas, sin modo de desarrollador.
- [ ] Cuenta de desarrollador de Google (5 USD, pago único).
- [ ] Ficha: descripción, capturas 1280×800, icono de 128 px (ya existe en `icons/`).
- [ ] Política de privacidad breve y justificación de cada permiso.
- [ ] Publicar como **No listada** y compartir el enlace con el equipo.

## 5. Historial en servidor, por cuenta (pospuesto)
Hoy el historial es personal y vive en la sincronización de Chrome (máx. 150 páginas). Se planteó llevarlo a un servidor propio para:
- quitar el límite de 150 páginas y tener respaldo;
- avisar si **otra persona** ya extrajo esa página (*"ya la extrajo maria@… el 29/09"*).

Diseño acordado:
- **Servicio:** Node.js + SQLite en Docker, en el **VPS Contabo de la empresa**. La IP y el acceso los tiene TI; no se publican aquí.
- **Dominio:** `contenido.comprafacil-usa.com`, que ya apunta al VPS.
- **Publicación:** el VPS usa Dokploy con **Traefik**. Sin acceso al panel de Dokploy, se puede desplegar con `docker compose` en la red `dokploy-network`, con etiquetas de Traefik (`certResolver: letsencrypt`) para el HTTPS.
- **Identidad:** "Iniciar sesión con Google" en la extensión (`chrome.identity`), verificando el token en el servidor. Se acordó aceptar **cualquier cuenta de Google**.
- **Efecto secundario:** requiere un **ID de extensión fijo** (clave `key` en `manifest.json`) y un **cliente OAuth** en Google Cloud Console. Al fijar el ID, Chrome la trata como una extensión nueva: cada PC debe **cargarla de nuevo una vez** y pierde la lista en curso y el historial local.
- **Acceso SSH:** desde la PC original se configuró una llave dedicada. En otra PC habrá que autorizar una llave nueva (pedir a TI o usar la contraseña del VPS una vez).

## 6. Amazon: un producto por familia (v1.10.1)
Problema (02/10/2026, tienda Sidagar): el Excel llevaba 25 ASIN de solo 10 familias de Amazon. El sistema descarga la familia completa de cada ASIN (83 filas), así que esas familias se crearon repetidas y partidas en 19 grupos. El aviso `ref_duplicado` (mismo nombre o imagen) no lo detectaba, porque los títulos cambian por el color.
- [x] La familia sale de la página `/dp/` (`parentAsin` y `dimensionToAsinMap`, en el HTML inicial). Comprobado con la página guardada de B0FBM8WSKR: sus 10 variantes son las 10 filas que el sistema agrupó.
- [x] Se conserva el primero de la página; familia ya en la lista: se omite el nuevo (aviso con el grupo); sin familia (error o CAPTCHA): se conserva con `Familia sin verificar`. Pausa de 1,5 a 3 s entre descargas.
- [x] Límite por productos = familias, con pregunta *Seguir / Detener y guardar* (popup y notificación, sin límite de tiempo); al llegar a 10 páginas se detiene y avisa.
- [x] Al exportar se verifican los productos de Amazon sin familia de los grupos con variantes (en segundo plano) y el Excel lleva uno por familia.
- [x] Pruebas en jsdom con los HTML guardados (tienda, búsqueda, producto), paginación simulada con la pregunta, service worker + popup (pregunta, notificación, exportación, Detener) y Excel leído como el backend; regresión de Sephora, Michael Kors y Marc Jacobs.
- [x] Tienda Sidagar en Chrome real (03/10/2026): 10 productos de 25, todos de familias distintas (revisado a mano), sin "Familia sin verificar" ni celdas vacías.
- [x] Chrome real (03/10/2026): búsqueda con límite por productos que provoca la pregunta (respuesta desde el popup y desde la notificación), página de producto de una familia ya extraída y exportación.
- [ ] Observar en el uso diario cuántas descargas seguidas aguanta Amazon antes de pedir CAPTCHA; si aparece seguido, subir `familias.delayMs`/`delayMaxMs` en `config.json` (no requiere versión nueva).
- [ ] Subir al sistema el Excel de Sidagar nuevo y confirmar que cada familia se crea una sola vez.
- [x] **Opciones del grupo, orden de columnas y duración** (03/10/2026): jsdom con service worker + popup (grupo con y sin variantes, etiquetas en la lista, resumen, notificación, duración sin la espera de la pregunta) y Excel leído con SheetJS como el backend (orden, `Sí`/`No`, desplegables, fórmula de `codigo_categoria`, sin celdas `''`).
- [x] Chrome real (03/10/2026): extracción con y sin *Extraer variantes*, etiquetas y duración, y Excel con el nuevo orden de columnas.
- [X] Subir al sistema un Excel de Amazon con `variacion = No` y confirmar que crea solo ese ASIN; y uno con `guia_talla = Sí`.

## 7. Vista previa del Excel (v1.12.0)
Pestaña `preview.html` (botón **Vista previa** del popup) con las filas que tendrá el Excel, calculadas con la misma función que el archivo (`filasExcel` en `xlsx.js`).
- [x] **Fase 1, solo lectura:** resumen de avisos, tabla con imagen, avisos, sitio, `sku`, link, grupo, categoría, opciones y condición; filtros (texto, grupo, sitio, solo con avisos); sección *No irán al Excel* (familia repetida, sin SKU); descarga desde la pestaña; actualización sola; enlace por grupo desde el popup.
- [x] Pruebas en jsdom (06/10/2026): Excel igual antes y después de separar `filasExcel` (mismas hojas y resumen, leídos con SheetJS); vista previa con productos de los 5 sitios (las filas y los `sku` coinciden con el Excel descargado, Sephora sin `sku`, texto con `<b>` mostrado como texto); filtros; actualización al agregar un producto; descarga directa y encolada (familias por verificar); popup (botón, enlace del grupo, descarga) y service worker (icono por pestaña, icono general fuera del sitio o si falta el PNG). Capturas con Edge sin interfaz.
- [x] **Fase 2, quitar productos** (decisiones del 06/10/2026: preguntar cada vez por la familia, no recordar los quitados, incluida en la v1.12.0): 🗑 por fila, casillas con *Quitar seleccionados* y "todas las visibles", pregunta *Quitar solo este* / *Quitar la familia completa* cuando entraría otro producto de la familia, *Deshacer* (devuelve cada producto a su lugar), bloqueo mientras se exporta, línea *Quitados a mano* en el resumen del grupo. La confirmación avisa cuando el producto representa a su familia (tamaño y omitidos al extraer: el scraper guarda `familiaTam` y `familiaOmitidos`, informativos, no van al Excel). La tabla los muestra en la columna *Familia* y el resumen suma familias, variantes y omitidos al extraer. Lo hace el service worker bajo `conLock` (no pisa lo que guarda una extracción) y solo desde páginas de la extensión.
- [x] Pruebas en jsdom (06/10/2026): vista previa con el service worker simulado (quitar sin familia, solo este, deshacer, familia completa, Esc cancela, seleccionar visibles con filtro, bloqueo, Excel descargado sin los quitados); `background.js` real (mensaje desde una página web rechazado, rechazo durante una exportación, dos peticiones a la vez sin perder ninguna, deshacer en el orden original); orden al deshacer con quitados seguidos y parciales; popup con la línea *Quitados a mano*; `syncGroups` conserva el grupo vaciado. Captura del diálogo con Edge sin interfaz. Scraper: prueba de la tienda Sidagar guardada (`familiaOmitidos` suma los 6 repetidos, `familiaTam` igual al número de hermanos de cada familia) y regresión de Kate Spade completa (con la v1.10.1 real como versión vieja).
