# Amazon Product Scraper

Extensión para Chrome, Edge y otros navegadores Chromium (Manifest V3). Extrae productos de páginas de Amazon.com y los exporta al CSV de COMPRAFACIL.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. Pulsa **Cargar descomprimida** y elige esta carpeta.

## Uso

- **Extraer productos**: analiza la pestaña actual de Amazon y descarga el CSV.
- **Desplazar la página…**: recorre la página hasta el final antes de extraer, para cargar los productos que aparecen al hacer scroll.
- **Acumular varias páginas**: cada extracción se suma a una lista (sin repetir ASIN). Recorre las páginas de resultados y pulsa **Descargar CSV** al final. El panel muestra las páginas agregadas con su categoría y un enlace a cada una. Las que no tienen categoría aparecen como "Multicategoría N".
- **Categoría**: se pide antes de cada extracción. El buscador filtra mientras escribes, por cualquier parte de la ruta (`Hogar / Menaje de Cocina / Juegos de ollas`) o por el código. El CSV lleva `CATEGORIA PRINCIPAL`, `CATEGORIA SECUNDARIA`, `CATEGORIA TERCIARIA` y `COD CATEGORIA`. Con "Múltiples categorías" las columnas quedan vacías para llenarlas a mano.
- **Nombre del archivo**: opcional. `Audifonos Hyperx` genera `Audifonos_Hyperx_2026-09-29_14-35.csv`. Si se deja vacío, se usa `Plantilla_Scrapping_<fecha>_<hora>.csv`.
- **Historial**: si vuelves a extraer una página ya extraída, la extensión avisa y ofrece reemplazar los datos anteriores. La URL se compara sin parámetros de rastreo, que se configuran en `history.keepParams`. El historial completo está en **Opciones**.

### Lista de categorías (automática)

1. El workflow [`categorias.yml`](.github/workflows/categorias.yml) consulta la API del sistema cada 3 horas y, si hubo cambios, actualiza [`categories.json`](categories.json) en este repositorio. Usa el token del secret **`API_TOKEN`** (Settings → Secrets and variables → Actions). El token nunca va en el código ni en la extensión.
2. Cada extensión lee `categories.json` de GitHub cada hora, o al pulsar **↻ Actualizar** en el popup. Si no hay conexión, usa la copia incluida en la extensión.

Si se crea una categoría y se necesita ya: **Actions → Actualizar categorías → Run workflow**. Al terminar, pulsa **↻ Actualizar** en la extensión.

Páginas compatibles: resultados de búsqueda, grillas `ProductUIRender`, grillas `ProductGridItem` (tiendas de marca), `ProductShowcase` y `EditorialTile` (mosaicos de producto en tiendas de marca).

## Actualización remota

Manifest V3 **no permite descargar y ejecutar código**. Por eso la actualización tiene dos niveles.

### 1. Configuración remota (sin reinstalar nada)

Casi todo lo que se rompe cuando Amazon cambia su HTML son los **selectores**, y estos viven en `config.default.json`, no en el código. Puedes publicar una copia modificada en cualquier URL HTTPS y todas las extensiones la aplicarán solas (al abrir el navegador, cada 3 horas y al abrir el popup si pasaron más de 30 minutos).

Desde la configuración remota puedes cambiar:

| Campo | Para qué sirve |
|---|---|
| `layouts[]` | Tipos de página: selector del contenedor (`item`) y selectores de título, enlace, imagen, marca y precio. Para añadir un layout nuevo basta con agregar una entrada. |
| `price` | Selectores del precio estándar `.a-price`. |
| `csv.headers` / `csv.fields` / `csv.defaults` | Columnas del CSV, qué dato va en cada una y sus valores fijos. |
| `latestVersion` / `downloadUrl` | Si `latestVersion` es mayor que la versión instalada, el popup muestra un aviso con el enlace de descarga. |
| `notice` | Mensaje libre que se muestra en el popup. |

Reglas de seguridad:
- `schemaVersion` debe coincidir con el que soporta la extensión (hoy `1`).
- `revision` debe ser **mayor o igual** que la de `config.default.json`. Súbela en cada cambio.
- `minExtensionVersion` permite exigir una versión mínima. Las extensiones más antiguas ignoran esa configuración.
- Si la descarga o la validación falla, se sigue usando la última configuración válida.

**Dónde vive**: el archivo [`config.json`](config.json) de este repositorio. La extensión lo lee desde
`https://raw.githubusercontent.com/h3b3rt/Extension_Amazon_CF_Scrapping/main/config.json`.

**Para cambiar selectores**:
1. Edita `config.json` y sube el número de `revision`.
2. Haz commit y push a `main`.
3. Las extensiones lo aplican en unas horas. Para aplicarlo al momento: **Opciones → Comprobar ahora**.

`config.default.json` es la copia que va dentro de la extensión. Conviene mantenerla igual que `config.json` al publicar una versión nueva. En otro equipo se puede usar una URL distinta desde **Opciones → Configuración remota**.

### 2. Nuevas versiones del código

1. Sube `version` en `manifest.json` (por ejemplo `1.2.0`), y `latestVersion` en `config.json` y `config.default.json`.
2. Haz commit y push.
3. En GitHub: **Releases → Draft a new release → Choose a tag**, escribe `v1.2.0` y pulsa **Publish release**. También se puede con `git tag v1.2.0` y `git push origin v1.2.0`.
4. GitHub Actions ([release.yml](.github/workflows/release.yml)) valida que la etiqueta coincida con el manifest, genera el `.zip` y lo adjunta a la Release.
5. El popup muestra el aviso de versión nueva con el enlace a la última Release.

Para instalar la versión nueva en un equipo:
- **Instalación descomprimida**: ejecuta `tools\actualizar.ps1 -Url <url-del-zip-de-la-release>` y pulsa *Recargar extensión* en Opciones. También se puede descargar el zip, descomprimirlo sobre la carpeta y recargar.
- **Chrome Web Store como "No listada"**: sube el mismo `.zip` a la tienda y las extensiones se actualizan solas. Cuesta 5 USD una sola vez.

## Archivos

| Archivo | Función |
|---|---|
| `manifest.json` | Definición de la extensión |
| `config.default.json` | Selectores y formato CSV incluidos en la extensión |
| `config.json` | Configuración remota (se sirve desde GitHub, no va en el paquete) |
| `.github/workflows/release.yml` | Publica el `.zip` al crear una etiqueta `vX.Y.Z` |
| `config.js` | Carga, validación y sincronización de la configuración |
| `background.js` | Service worker: sincronización periódica |
| `scraper.js` | Extracción de productos, se inyecta en la página |
| `popup.html` / `popup.js` | Interfaz principal |
| `options.html` / `options.js` | Opciones y estado de la configuración |
| `tools/` | Scripts para empaquetar y actualizar |
