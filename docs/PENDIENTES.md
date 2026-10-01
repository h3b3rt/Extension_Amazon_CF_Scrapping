# Pendientes y próximos pasos

Estado al **01/10/2026** (versión publicada: **v1.6.0**; en preparación: **v1.7.0**, página de producto y grupos).

## 1. Categorías automáticas desde la API ✅
- [x] Secrets **`CF_EMAIL`** y **`CF_PASSWORD`** creados en GitHub. Ver [CATEGORIAS.md](CATEGORIAS.md).
- [x] El workflow **Actualizar categorías** inicia sesión y descarga la lista cada 3 horas (ejecuciones correctas desde el 30/09/2026). La lista de la API coincide con la cargada a mano el 29/09/2026, por eso todavía no hubo commit de `categories.json`: se hará solo cuando cambie una categoría.

## 2. Probar en Chrome real
Varias funciones solo se probaron en simulación (jsdom) y con capturas de Chrome sin interfaz:
- [ ] Buscador de categorías y modo **Por niveles**.
- [ ] Botón **↻ Actualizar** categorías.
- [ ] Historial sincronizado entre dos PCs con la misma cuenta de Google.
- [ ] Extracción en una tienda de marca con **EditorialTile**.
- [x] **v1.6.0:** abrir el Excel descargado en **Google Sheets** y revisar la vista previa `ref_imagen`, el desplegable de `Buscar categoria` y que `codigo_categoria` cambie al elegir otra ruta.
- [x] **v1.7.0:** extracción en Chrome real de búsquedas y de una página de producto: un solo producto (sin sugerencias), con precio y marca. Excel de prueba revisado el 01/10/2026: 80 filas, `ref_grupo` lleno y por bloques, sin celdas `''` ni columnas del backend llenas.
- [x] **v1.7.0:** grupos en el popup: nombrar, separar, renombrar y enlace ↗ a la página original.
- [ ] **v1.7.0:** página de producto **sin precio** ("Currently unavailable") y la marca cuando no hay fila "Marca" (solo `#bylineInfo`, en inglés: "Visit the X Store").
- [ ] **v1.6.0:** subir un Excel de prueba al sistema (`POST /product/upload/list`) y confirmar que se crean los productos con su categoría y condición.

## 3. Otros ecommerce de la plantilla
La plantilla acepta Amazon, Sephora, Marc Jacobs, Kate Spade y Michael Kors. Hoy la extensión solo trabaja con Amazon.
- [ ] Operaciones: una URL de listado y una fila de ejemplo llena por sitio. Elegir uno como piloto.
- [ ] Sephora y Michael Kors: no escribir la celda `sku` cuando el ID va en el `link` (el backend no se modificará: una celda `''` hace que se pierda la fila).
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
