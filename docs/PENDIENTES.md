# Pendientes y próximos pasos

Estado al **02/10/2026**.

- **Publicada: v1.9.0** (02/10/2026): Sephora; anuncios fuera, páginas siguientes y portada de categoría en Amazon; límite por páginas; extracciones en segundo plano con cola, notificación y "Detener"; resumen desplegable y 🗑 por grupo.
- **Siguiente: v1.10.0**, con Marc Jacobs y Kate Spade (sección 3). Mientras esté en preparación, sus commits se quedan locales (sin push ni etiqueta); el commit que la publique cambia este estado a *"Publicada: v1.10.0"*.

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

## 3. Otros ecommerce de la plantilla
La plantilla acepta Amazon, Sephora, Marc Jacobs, Kate Spade y Michael Kors.
- [x] **Michael Kors** (piloto, v1.8.0). El backend toma el SKU de la columna `sku` o, si falta, del link (`/<ID>.html` del pathname; ignora los parámetros). Si ambos vienen, gana `sku`. La extensión escribe los dos y saca el SKU del link, así siempre coinciden. Una fila sin SKU se descarta sin aviso.
- [x] **Sephora** (v1.9.0). El backend (`parseSephoraUrl`) saca del link el `skuId` (sku) y el primer `-<letra><dígitos>` de la ruta (`product_id`, el `P…`). La extensión deja `sku` vacía (llena, borraría el `P…`), arma el link limpio `…-P123?skuId=…`, omite los links sin `skuId` o con otro código antes del `P…`, y deja una fila por `P…` (el SP solo elimina duplicados por sku). El backend no se modifica.
- [ ] **Marc Jacobs y Kate Spade** (entran juntos en la v1.10.0: no se publica, es decir, sin push ni etiqueta, hasta tenerlos). Criterios en CLAUDE.md ("Adding an ecommerce"). Para cada uno hace falta: cómo obtiene el SKU el backend, y HTML de un producto, un producto en oferta, una búsqueda, una categoría y una marca o submarca (guardado desde Chrome con `copy(document.documentElement.outerHTML)`, sin bloqueador de anuncios), más URLs reales de búsqueda, filtro y página 2. Se agrega en `config.json → sites` y en `host_permissions`.
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
