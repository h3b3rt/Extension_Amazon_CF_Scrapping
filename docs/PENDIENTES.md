# Pendientes y próximos pasos

Estado al **03/10/2026**.

- **Publicada: v1.10.1** (03/10/2026, correcciones): Amazon, un producto por familia (sección 6); opciones del grupo *Extraer variantes* y *Guía de tallas* (`variacion`/`guia_talla` = Sí/No, fijas desde la extracción; sin variantes no se verifican familias); columnas vacías del backend al final del Excel; duración de la extracción en el resumen y la notificación.
- v1.10.0 (02/10/2026): Marc Jacobs (solo `/us-en/`; una fila por modelo; categorías y búsquedas con carga en segundo plano; botón a EE. UU. desde otra región).
- v1.9.0 (02/10/2026): Sephora; anuncios fuera, páginas siguientes y portada de categoría en Amazon; límite por páginas; extracciones en segundo plano con cola, notificación y "Detener"; resumen desplegable y 🗑 por grupo.
- **Siguiente: v1.11.0**, con Kate Spade (sección 3). Mientras esté en preparación, sus commits se quedan locales (sin push ni etiqueta); el commit que la publique cambia este estado a *"Publicada: v1.11.0"*.

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
- [ ] **v1.9.0:** al actualizar con el zip de la Release, comprobar si Chrome pide aceptar los permisos nuevos (`sephora.com` y notificaciones) y avisar al equipo.
- [x] **v1.9.0:** límite por páginas en Chrome real (02/10/2026): 1 página, varias páginas desde una que no es la primera, cambio a Productos y valor recordado por sitio.
- [x] **v1.9.0:** Amazon en Chrome real (02/10/2026): búsqueda con más de una página (descarga de las páginas siguientes, sin captcha), anuncios omitidos, portada de categoría `/b?node=` y tienda de marca con `/-/es/`.
- [ ] **v1.9.0:** subir al sistema un Excel con filas de Sephora (sin `sku`) y confirmar que se crean con el `skuId` y el `P…` del link.
- [ ] **v1.6.0:** subir un Excel de prueba al sistema (`POST /product/upload/list`) y confirmar que se crean los productos con su categoría y condición.
- [x] **v1.10.1:** familias de Amazon, opciones del grupo, orden de columnas y duración en Chrome real (03/10/2026; ver sección 6).

## 3. Otros ecommerce de la plantilla
La plantilla acepta Amazon, Sephora, Marc Jacobs, Kate Spade y Michael Kors.
- [x] **Michael Kors** (piloto, v1.8.0). El backend toma el SKU de la columna `sku` o, si falta, del link (`/<ID>.html` del pathname; ignora los parámetros). Si ambos vienen, gana `sku`. La extensión escribe los dos y saca el SKU del link, así siempre coinciden. Una fila sin SKU se descarta sin aviso.
- [x] **Sephora** (v1.9.0). El backend (`parseSephoraUrl`) saca del link el `skuId` (sku) y el primer `-<letra><dígitos>` de la ruta (`product_id`, el `P…`). La extensión deja `sku` vacía (llena, borraría el `P…`), arma el link limpio `…-P123?skuId=…`, omite los links sin `skuId` o con otro código antes del `P…`, y deja una fila por `P…` (el SP solo elimina duplicados por sku). El backend no se modifica.
- [x] **Marc Jacobs** (v1.10.0). El backend (`normalizeSku`) solo lee la columna `sku` (ignora el link): corta en el primer `-`, mayúsculas y quita lo que no sea `A-Z0-9`. La extensión escribe ese modelo base como texto, una fila por modelo (primer color), omite los SKU de más de 15 caracteres (`product_id` VARCHAR(15)), solo extrae `/us-en/` (otra región: botón a `/us-en/homepage`), descarga los tramos de `Search-UpdateGrid` (scroll infinito, límite solo por productos) y, con la búsqueda abierta en el panel, ofrece abrir `/us-en/search?q=…`. Probado en Chrome real el 02/10/2026: categoría con tramos, filtro, búsqueda como página, producto, otra región.
- [ ] **Kate Spade** (v1.11.0; misma lógica de backend que Marc Jacobs, con `asin = null`). Criterios en CLAUDE.md ("Adding an ecommerce"). Para cada uno hace falta: cómo obtiene el SKU el backend, y HTML de un producto, un producto en oferta, una búsqueda, una categoría y una marca o submarca (guardado desde Chrome con `copy(document.documentElement.outerHTML)`, sin bloqueador de anuncios), más URLs reales de búsqueda, filtro y página 2. Se agrega en `config.json → sites` y en `host_permissions`.
- [ ] **Al terminar todos los ecommerce:** icono por sitio. Hoy solo cambia el título; el icono es el mismo en todos. Se haría con `chrome.action.setIcon` por pestaña (como el título en `background.js`), con iconos de 16 y 32 px por sitio incluidos en el paquete: Chrome no acepta imágenes remotas, así que requiere versión nueva. Propuesta: la bolsa naranja con un distintivo de texto ("A", "MK"…), sin logos de marcas. Definir antes si se usan iconos propios.
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
- [ ] Subir al sistema un Excel de Amazon con `variacion = No` y confirmar que crea solo ese ASIN; y uno con `guia_talla = Sí`.
