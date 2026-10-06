# Desarrollo

## Preparar otra PC

1. Instala **Git** (https://git-scm.com) y **VS Code**. Node.js es opcional; solo hace falta para las pruebas.
2. Clona el repositorio:
   ```powershell
   cd C:\Aldair\CF
   git clone https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping.git amazon-product-scraper
   cd amazon-product-scraper
   ```
3. Configura tu identidad de git para este repo:
   ```powershell
   git config user.name "h3b3rt"
   git config user.email "<tu correo>"
   ```
4. En Chrome: `chrome://extensions` → **Modo de desarrollador** → **Cargar descomprimida** → elige la carpeta clonada.
5. Tras cada cambio en el código, pulsa ↻ en `chrome://extensions` y vuelve a abrir el popup.
6. El primer `git push` abre el navegador para iniciar sesión en GitHub. Complétalo sin cerrar la ventana. Desde VS Code también puedes usar **Source Control → Sync Changes**.

## Arquitectura

```
popup.js ──"enqueue"──▶ background.js (service worker: cola de extracciones)
   │  (muestra avance,          │  executeScript
   │   cola y resultado)        ▼
   │                         scraper.js (en la pestaña del sitio)
   │                            └─ scrapeProgress / scrapePartial / scrapeDone ──▶ background.js
   │                                                     └─ jobs.js: guarda lista, grupo (con resumen) e historial
   ├─ config.js      ◀── config.json (GitHub) / config.default.json
   ├─ categories.js  ◀── categories.json (GitHub) / copia incluida
   ├─ history.js     ──▶ chrome.storage.sync (historial personal)
   ├─ groups.js      (grupos de la lista: nombres, migración, orden del Excel)
   ├─ sites.js       (sitios: cuál es la pestaña, su configuración, su título y su icono)
   ├─ export.js      (descarga del Excel, también desde el service worker)
   ├─ descarga.js    ("Descargar Excel" del popup y de la vista previa: directo o encolado)
   ├─ familias.js    (familias de Amazon y Kate Spade; también se inyecta en la pestaña)
   └─ prefs.js
background.js: además refresca la configuración al iniciar y cada 3 h (chrome.alarms)
               y pone el título y la imagen del icono según el sitio de la pestaña
preview.html / preview.js: vista previa del Excel en una pestaña (lee storage.local)
```

- **Iconos por sitio (v1.12.0):** `config.sites[].icono` (sin la clave, el `id` del sitio) elige `icons/sitios/<icono>-16.png` y `-32.png`, incluidos en el paquete (Chrome no acepta imágenes remotas). `background.js` los fija por pestaña con `chrome.action.setIcon` junto al título; fuera de un sitio, o si el archivo no existe, vuelve a `DEFAULT_ICON`. Los PNG se generan con `node tools/iconos-sitios.mjs <carpeta>` (favicon de cada sitio dentro del marco naranja; usa Chrome, Edge o Brave sin interfaz). La carpeta tiene un archivo por `id` (`amazon.png`, `michaelkors.jpg`…); el favicon se puede bajar de `https://www.google.com/s2/favicons?domain=<dominio>&sz=128`.
- **Vista previa (v1.12.0):** `filasExcel(products, config.xlsx)` en `xlsx.js` calcula los valores de cada fila por nombre de columna (`celdas`, lo que lee el backend; `ref`, las columnas `ref_*`) y el resumen. `buildWorkbook` y `preview.js` la usan los dos, así la vista previa no puede diferir del archivo. `preview.js` aplica antes `productsForExport` y `unoPorFamilia`, como `exportList`, y marca *Familia por verificar* con `sinFamilia` de `jobs.js`. Para **quitar productos** envía `{type:'quitarProductos', claves}` (y `restaurarProductos` para Deshacer) al service worker, que cambia la lista dentro de `conLock` (`cambiarLista` en `background.js`), así no pisa lo que guarda una extracción; solo acepta mensajes de páginas de la extensión (`sender.url`) y se niega mientras hay un trabajo `exportar` en curso (`verificarLista` escribe la lista fuera del lock). `quitarDeLista`/`restaurarEnLista` (`groups.js`) guardan la posición (`despues`) para devolver cada producto a su lugar, porque el orden decide qué producto representa a una familia; el grupo cuenta `quitados` y `syncGroups` no borra un grupo vacío con `quitados`. `productsForExport` añade `clave` (no es columna del Excel). Se redibuja con `storage.onChanged` (`collected`, `groups`, y `jobs` solo cuando empieza o termina una extracción). `?grupo=<id>` abre la vista filtrada por ese grupo.

- **Sin código remoto:** todo lo que viene de GitHub son datos (JSON). El HTML nunca se construye con `innerHTML` a partir de datos remotos; se usa `textContent`.
- **Extracciones (v1.9.0):** las ejecuta el **service worker**, no el popup, para que sigan al cerrarlo. El popup envía `{ type: 'enqueue', job }` (pestaña, URL, sitio y su configuración, categoría, grupo, límite) y lee el estado de `storage.local.jobs` (`{ actual, cola, ultimo }`), que se actualiza con `storage.onChanged`. Una a la vez; el resto espera en la cola. El scraper recibe `options.jobId` y avisa con mensajes: `scrapeProgress` (avance y `pausada`), `scrapePartial` (productos nuevos, que el service worker acumula en `storage.session.parcial`) y `scrapeDone` (resultado). Si la pestaña se cierra, la página se recarga (alarma `jobs-watchdog` que comprueba `globalThis.__cfCorriendo`) o se pulsa "Detener" (`globalThis.__cfDetener = true` en la pestaña), se guarda lo leído. Al terminar: notificación (`chrome.notifications`) y texto en el icono (`2/5`, `⏸`, `✓`).
- **Familias de Amazon (v1.10.1):** `familias.js` es un script clásico (sin `import`/`export`) que deja sus funciones en `globalThis.__cfFamilias`: se inyecta en la pestaña antes de `scraper.js` y los módulos lo cargan con `import './familias.js'`. Con `config.familias` (sitio Amazon), el scraper pasa lo leído por una cola `pendientes` y `verificar()` descarga la `/dp/` de cada ASIN (pausa al azar, sin descargar los hermanos ya conocidos) para quedarse con el primero de cada familia; en modo productos el límite cuenta familias y, al analizar tantos productos como el límite, pregunta con `scrapeConfirm` (el service worker guarda `actual.confirmacion`, muestra una notificación con botones y responde con `globalThis.__cfResponder("seguir" | "detener")`). El service worker pasa `options.familiasLista` (familias ya en la lista) para omitir los de una familia ya extraída. Al exportar, si hay productos de Amazon sin `familia`, el popup encola un trabajo `{ tipo: 'exportar' }` que verifica (`verificarLista` en `jobs.js`) y descarga con `exportList` (un producto por familia).
- **Familias de Kate Spade (v1.11.0):** el mismo mecanismo con `familias.tipo: "jsonld"`: la familia sale del `ProductGroup` del JSON-LD de la página del producto (se descarga su link). `productGroupID` es el estilo de la página abierta, así que dos páginas de una familia dan nombres distintos: el scraper y `verificarLista` usan la familia ya conocida de cualquier hermano. `familias.siempre` agrupa aunque el grupo no tenga variantes (`porEcomerce` y `agrupa` en `familias.js` deciden qué productos se agrupan por ecommerce); `guardarHermanos` guarda `hermanos` en cada producto, que `familiasDeLaLista` pasa como `familiasLista.hermanos`. `verificarLista(config)` verifica cada producto con la configuración de familias de su sitio.
- **`scraper.js`** define `globalThis.__cfScraper(config, options)`. El service worker lo llama con `chrome.scripting.executeScript`, pasando la configuración del sitio (`siteConfig` de `sites.js`), `options.limit` o `options.pages` y `options.jobId`. El SKU se guarda en el campo `asin` por compatibilidad. Todo lo específico de cada tipo de página está en `config.layouts`, no en el código. `config.pageTypes` reserva layouts para un tipo de página (p. ej. `detalle` para la página de producto): en esa página solo corren esos, y en las demás no corren.
- **Módulos ES:** `popup.js`, `options.js` y `background.js` (`"type": "module"`) importan `config.js`, `categories.js`, `history.js` y `prefs.js`. El popup importa además `xlsx.js`, que genera el Excel desde `plantilla.xlsx` sin librerías (zip con `DecompressionStream`/`CompressionStream`).

### Almacenamiento

| Dónde | Clave | Contenido |
|---|---|---|
| `storage.local` | `collected` | Lista en curso: `{ clave: producto }`; clave = ASIN (Amazon) o `sitio:SKU` (otros). Cada producto guarda su `grupo` (id) y su `ecomerce`. Amazon (v1.10.1): `familia` (ASIN padre, o el propio si no tiene variantes) o `familiaAviso` (`Familia sin verificar`). Kate Spade (v1.11.0): `familia` (estilo que nombra la familia) y `hermanos` (estilos de la familia) |
| `storage.local` | `loadPrefs` | Límite de la extracción por sitio (v1.9.0): `{ sephora: { modo: "paginas", paginas: 2, productos: 80 } }`. Sin datos = 1 página. La clave `loadLimits` (v1.8.0, número de productos) ya no se lee |
| `storage.local` | `groups` | Grupos de la lista: `{ id: { nombre, origen, fecha, titulo, categoria, resumen } }` (`resumen`: líneas del resumen de su extracción, desde la v1.9.0) |
| `storage.local` | `jobs` | Extracciones (v1.9.0): `{ actual, cola: [...], ultimo }`. `actual.progreso` = `{ pagina, paginas, cargados, limite, pausada, analizados, familias, verificando }` (exportación: `{ verificando, total }`); `actual.confirmacion` = `{ analizados, familias, limite }` mientras espera respuesta; `ultimo` = resultado de la última (`mensaje`, `visto`) |
| `storage.session` | `parcial`, `avisos` | Productos ya leídos de la extracción en curso (se guardan si se corta) y notificaciones → pestaña |
| `storage.local` | `remoteConfig`, `configMeta`, `settings` | Configuración remota en caché y su estado |
| `storage.local` | `cfCategories` | Categorías en caché `{ items, fetchedAt, source, error }` |
| `storage.local` | `extractPrefs` | `autoScroll`, `accumulate` (por defecto `true`) |
| `storage.local` | `recentCategories`, `categoryMode` | Categorías recientes y modo del selector (`search` / `browse`) |
| `storage.sync` | `h_<hash>` | Una entrada del historial por página (máx. 150; límite de ~100 KB de Chrome) |

## Publicar una versión nueva

1. Sube la versión en **tres sitios** (ejemplo con la 1.9.0):
   - `manifest.json` → `"version": "1.9.0"`
   - `config.json` y `config.default.json` → `"latestVersion": "1.9.0"` y sube `"revision"`
   - En el **mismo commit**, actualiza el estado al inicio de [PENDIENTES.md](PENDIENTES.md): *"Publicada: v1.9.0"* (y quítala de *"Siguiente"*). Mientras la versión no se publica, PENDIENTES sigue diciendo que la publicada es la anterior.
2. Commit y push a `main`. **Ojo:** el push publica `config.json` para todas las extensiones instaladas (aviso de versión nueva incluido). Mientras una versión está en preparación, los commits se quedan locales: el push y la etiqueta van juntos, al publicar.
3. Crea y sube la etiqueta:
   ```powershell
   git tag v1.9.0
   git push origin v1.9.0
   ```
4. El workflow [`release.yml`](../.github/workflows/release.yml):
   - comprueba que la etiqueta coincida con `manifest.json`,
   - genera `amazon-product-scraper-1.9.0.zip` (con `categories.json` y `plantilla.xlsx` incluidos),
   - lo publica en **Releases**.
5. Las extensiones instaladas muestran el aviso de versión nueva.

> Si solo cambian selectores o las columnas de ayuda del Excel, **no hace falta versión nueva**: basta con editar `config.json` y subir `revision`. Ver [CONFIGURACION-REMOTA.md](CONFIGURACION-REMOTA.md).

`tools/empaquetar.ps1` genera el mismo zip en `dist/` para subirlo a mano, por ejemplo a Chrome Web Store.

## Probar

No hay suite de pruebas automáticas en el repo. Durante el desarrollo se probó así:

- **Sintaxis:** `node --check popup.js`, y lo mismo con cada módulo. Si está bien no muestra nada. En PowerShell, todos a la vez:
  ```powershell
  Get-ChildItem *.js | ForEach-Object { node --check $_.FullName; if ($?) { "OK  $($_.Name)" } }
  ```
  Sin nombre de archivo, `node --check` se queda esperando código por teclado (salir con Ctrl+C).
- **Excel:** generar el archivo con `buildWorkbook` en Node y leerlo con `XLSX.utils.sheet_to_json` **sin opciones**, como el backend. Comprobar que `sku`, `codigo_categoria` y `seguimiento` llegan bien y que ninguna celda llega como `''`.
- **Scraper:** cargar `scraper.js` en **jsdom** con HTML de ejemplo de Amazon y llamar a `__amazonScraper(config)`.
- **Popup:** ejecutar `popup.html` + módulos en jsdom con un `chrome` falso (`storage.local`/`sync`, `tabs`, `scripting`, `downloads`) y simular clics.
- **Vista previa:** lo mismo con `preview.html`, y comparar sus filas con el Excel que descarga (mismo número de filas y mismos `sku`).
- **Visual:** abrir el popup con datos de prueba en Chrome sin interfaz:
  ```powershell
  chrome --headless=new --screenshot=shot.png --window-size=420,560 file:///ruta/preview.html
  ```
- **Siempre**, antes de publicar: probar en Chrome real una búsqueda, una tienda de marca, una página de producto (`/dp/…`) un listado y un producto de Michael Kors, un listado de Sephora con más de 60 productos (paso de página) y un producto, una categoría de Marc Jacobs con más de 18 productos (tramos), su búsqueda como página y un producto, una categoría de Kate Spade con más de 16 productos (páginas siguientes y familias) y un producto, elegir categoría, descargar el Excel, abrirlo en Google Sheets (vista previa de imágenes y desplegable de categorías) y comprobar que el sistema lo acepta.

## Convenciones

- Interfaz y mensajes en **español**; comentarios del código también en español.
- Estilo del código: módulos pequeños, sin dependencias externas ni build.
- **Nunca** subir secretos al repo (es público). Las credenciales van en **GitHub Secrets**.
- Mensajes de commit descriptivos, en español.
