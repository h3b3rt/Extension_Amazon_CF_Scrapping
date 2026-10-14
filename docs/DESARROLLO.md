# Desarrollo

Otros documentos: el historial de versiones está en [CHANGELOG.md](../CHANGELOG.md) y cómo lee el backend el Excel, en [BACKEND.md](BACKEND.md).

## Preparar otra PC

1. Instala **Git** (https://git-scm.com) y **VS Code**. Node.js es opcional; solo hace falta para las pruebas.
2. Clona el repositorio:
   ```powershell
   cd <carpeta de trabajo>
   git clone https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping.git amazon-product-scraper
   cd amazon-product-scraper
   ```
3. Configura tu identidad de git para este repo:
   ```powershell
   git config user.name "<tu usuario de GitHub>"
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
   │                            └─ scrapeProgress / scrapePartial / scrapeDone / scrapeConfirm ──▶ background.js
   │                                                     └─ jobs.js: guarda lista, grupo (con resumen) e historial
   ├─ config.js      ◀── config.json (GitHub) / config.default.json
   ├─ categories.js  ◀── categories.json (GitHub) / copia incluida
   ├─ selector-categoria.js (selector de categoría, el mismo en el popup y la vista previa)
   ├─ history.js     ──▶ chrome.storage.sync (historial personal)
   ├─ groups.js      (grupos de la lista: nombres, migración, orden del Excel, quitar y categoría)
   ├─ sites.js       (sitios: cuál es la pestaña, su configuración, su título y su icono)
   ├─ export.js      (descarga del Excel, también desde el service worker; usa xlsx.js)
   ├─ descarga.js    ("Descargar Excel" del popup y de la vista previa: directo o encolado)
   ├─ familias.js    (familias y variantes; también se inyecta en la pestaña)
   ├─ dom.js         (ayudas de DOM compartidas)
   └─ prefs.js
background.js: además refresca la configuración al iniciar y cada 3 h (chrome.alarms)
               y pone el título y la imagen del icono según el sitio de la pestaña
preview.html / preview.js: vista previa del Excel en una pestaña (lee storage.local,
               escribe la lista solo con mensajes al service worker)
```

### Módulos

- **Módulos ES:** `popup.js`, `preview.js`, `options.js` y `background.js` (`"type": "module"`) importan `config.js`, `categories.js`, `history.js` y `prefs.js` según lo que necesiten. El popup importa `export.js` (resumen y nombre del archivo) y `descarga.js` (botón "Descargar Excel"); **no** importa `xlsx.js`. `xlsx.js` lo usan `export.js` (`buildWorkbook`) y `preview.js` (`filasExcel`). `xlsx.js` genera el Excel desde `plantilla.xlsx` sin librerías (zip con `DecompressionStream`/`CompressionStream`).
- **`dom.js`:** ayudas de DOM compartidas por las páginas de la extensión: `el` (crear un elemento con propiedades e hijos), `$` (`getElementById`), `plural` y `showStatus`.
- Los estilos del selector de categoría (`.sc-*`) están en cada página (`popup.html` y `preview.html`): cada una usa su propio tema (naranja en el popup, azul en la vista previa).
- **`scraper.js`** define `globalThis.__cfScraper(siteConfig, opts)`. El service worker lo llama con `chrome.scripting.executeScript`, sin esperar el resultado, pasando la configuración del sitio (`siteConfig` de `sites.js`) y en `opts` el límite (`limit` o `pages`), `jobId`, `autoScroll` y `familiasLista`. El SKU se guarda en el campo `asin` por compatibilidad. Todo lo específico de cada tipo de página está en `config.layouts`, no en el código. `config.pageTypes` reserva layouts para un tipo de página (p. ej. `detalle` para la página de producto): en esa página solo corren esos, y en las demás no corren.
- **Sin código remoto:** todo lo que viene de GitHub son datos (JSON). El HTML nunca se construye con `innerHTML` a partir de datos remotos; se usa `textContent`.

### Extracciones

Las ejecuta el **service worker**, no el popup, para que sigan al cerrarlo. El popup envía `{ type: 'enqueue', job }` (pestaña, URL, sitio y su configuración, categoría, grupo, opciones, límite) y lee el estado de `storage.local.jobs` (`{ actual, cola, ultimo }`), que se actualiza con `storage.onChanged`. Una a la vez; el resto espera en la cola. El scraper avisa con mensajes: `scrapeProgress` (avance y `pausada`), `scrapePartial` (productos nuevos, que el service worker acumula en `storage.session.parcial`), `scrapeConfirm` (pregunta "Seguir/Detener", ver familias) y `scrapeDone` (resultado). Si la pestaña se cierra, la página se recarga (alarma `jobs-watchdog` que comprueba `globalThis.__cfCorriendo`) o se pulsa "Detener" (`globalThis.__cfDetener = true` en la pestaña), se guarda lo leído. Al terminar: notificación (`chrome.notifications`) y texto en el icono (`2/5`, `⏸`, `✓`).

### Mensajes del service worker

`background.js` atiende los mensajes con la tabla `HANDLERS` (por `msg.type`):

| Desde | Mensaje | Qué hace |
|---|---|---|
| Popup | `enqueue` | Añade una extracción a la cola (`{ job }`) y devuelve su posición. |
| Popup | `removeJob` | Quita de la cola una extracción que aún no empezó (`{ id }`). |
| Popup | `stopJob` | Detiene la actual: en la pestaña, `__cfDetener` (y responde "detener" si esperaba confirmación); en una exportación, marca `detener`. |
| Popup | `seen` | Marca como visto el último resultado y repinta el icono. |
| Popup | `focusJob` | Lleva a la pestaña de la extracción (`{ tabId }`). |
| Popup | `answerJob` | Responde "Seguir/Detener" (`{ respuesta }`). |
| Vista previa | `quitarProductos` / `restaurarProductos` | Quita productos de la lista (`{ claves }`) y lo deshace (`{ quitados }`). |
| Vista previa | `asignarCategoria` | Pone una categoría del catálogo (`{ claves, cat }`, con código) a esos productos. |
| Vista previa | `limpiarCategoria` | Deja esos productos sin categoría (se elige en la plantilla). |
| Vista previa | `restaurarCategoria` | Deshace el último cambio de categoría (`{ previos }`). |
| Vista previa | `cambiarGuiaTalla` | Activa o desactiva la guía de tallas de un grupo (`{ grupo, valor }`) y reescribe la línea `Variaciones:` de su resumen. |
| Scraper | `scrapeProgress`, `scrapePartial`, `scrapeConfirm`, `scrapeDone` | Avance, productos parciales, pregunta de familias y resultado (llevan `jobId`). |

Los mensajes de la vista previa cambian la lista dentro de `conLock` (`cambiarLista`), así no pisan lo que guarda una extracción; solo se aceptan desde páginas de la extensión (`sender.url`) y se rechazan mientras hay un trabajo `exportar` en curso (`verificarLista` escribe la lista fuera del lock).

### Vista previa

- `filasExcel(products, config.xlsx)` en `xlsx.js` calcula los valores de cada fila por nombre de columna (`celdas`, lo que lee el backend; `ref`, las columnas `ref_*`) y el resumen. `buildWorkbook` y `preview.js` la usan los dos, así la vista previa no puede diferir del archivo. `preview.js` aplica antes `productsForExport` y `unoPorFamilia`, como `exportList`, y marca *Familia por verificar* con `sinFamilia` de `jobs.js`.
- **Quitar productos:** `quitarDeLista`/`restaurarEnLista` (`groups.js`) guardan la posición (`despues`) para devolver cada producto a su lugar, porque el orden decide qué producto representa a una familia; el grupo cuenta `quitados` y `syncGroups` no borra un grupo vacío con `quitados`. `productsForExport` añade `clave` (no es columna del Excel).
- **Asignar categoría:** `asignarCategoria`/`restaurarCategoria` (`groups.js`) escriben los campos de categoría del producto y recalculan la categoría del grupo (la de sus productos si todos comparten una; si no, *Varias categorías*) y la línea `Categoría:` de su resumen. La categoría se elige con `elegirCategoria` de `selector-categoria.js`.
- **Guía de tallas** editable por grupo desde la cabecera del grupo (`cambiarGuiaTalla`). *Extraer variantes* no se cambia después de extraer, ni en la vista previa.
- **Variantes:** el desplegable **▸ Ver variantes** usa las que guardó la extracción (campo `variantes`, Amazon y Kate Spade) y, si el producto no las trae, las busca en la página del producto con `descargarVariantes` de `familias.js`, una a una y detenida tras un bloqueo:
  - Sephora: `regularChildSkus` del `script#linkStore` de una descarga fresca (exige que `productId` sea el pedido).
  - Michael Kors: `ProductGroup.hasVariant` del JSON-LD, limitado a lo que muestra la página (swatches de color y tallas con precio).
  - Marc Jacobs: los colores del `input[name="colorSelector"]` (sin los de otro estilo) y la página de cada color para sus tallas.
  - Kate Spade: `hasVariant` del JSON-LD.

  Lo leído se guarda en `storage.local.variantesLeidas` 7 días, con la versión `VERSION_LEIDAS` de `preview.js`: al cambiar cómo se leen se sube y lo anterior se vuelve a buscar.
- Se redibuja con `storage.onChanged` (`collected`, `groups`, y `jobs` solo cuando empieza o termina una extracción). `?grupo=<id>` abre la vista filtrada por ese grupo.

### Familias

- **Amazon:** `familias.js` es un script clásico (sin `import`/`export`) que deja sus funciones en `globalThis.__cfFamilias`: se inyecta en la pestaña antes de `scraper.js` y los módulos lo cargan con `import './familias.js'`. Con `config.familias` (sitio Amazon), el scraper pasa lo leído por una cola `pendientes` y `verificar()` descarga la `/dp/` de cada ASIN (pausa al azar, sin descargar los hermanos ya conocidos) para quedarse con el primero de cada familia; en modo productos el límite cuenta familias y, al analizar tantos productos como el límite, pregunta con `scrapeConfirm` (el service worker guarda `actual.confirmacion`, muestra una notificación con botones y responde con `globalThis.__cfResponder("seguir" | "detener")`). El service worker pasa `opts.familiasLista` (familias ya en la lista) para omitir los de una familia ya extraída. Al exportar, si hay productos de Amazon sin `familia`, `descarga.js` (popup o vista previa) encola un trabajo `{ tipo: 'exportar' }` que verifica (`verificarLista` en `jobs.js`) y descarga con `exportList` (un producto por familia). Sin *Extraer variantes* el popup envía la extracción con `familias = null` (salvo los sitios con `familias.siempre`) y la exportación no verifica ni agrupa esos productos.
- **Kate Spade:** el mismo mecanismo con `familias.tipo: "jsonld"`: la familia sale del `ProductGroup` del JSON-LD de la página del producto (se descarga su link). `productGroupID` es el estilo de la página abierta, así que dos páginas de una familia dan nombres distintos: el scraper y `verificarLista` usan la familia ya conocida de cualquier hermano. `familias.siempre` agrupa aunque el grupo no tenga variantes (`porEcomerce` y `agrupa` en `familias.js` deciden qué productos se agrupan por ecommerce); `guardarHermanos` guarda `hermanos` en cada producto, que `familiasDeLaLista` pasa como `familiasLista.hermanos`. `verificarLista(config)` verifica cada producto con la configuración de familias de su sitio.

### Iconos por sitio

`config.sites[].icono` (sin la clave, el `id` del sitio) elige `icons/sitios/<icono>-16.png` y `-32.png`, incluidos en el paquete (Chrome no acepta imágenes remotas). `background.js` los fija por pestaña con `chrome.action.setIcon` junto al título; fuera de un sitio, o si el archivo no existe, vuelve a `DEFAULT_ICON`. Los PNG se generan con `node tools/iconos-sitios.mjs <carpeta>` (favicon de cada sitio dentro del marco naranja; usa Chrome, Edge o Brave sin interfaz). La carpeta tiene un archivo por `id` (`amazon.png`, `michaelkors.jpg`…); el favicon se puede bajar de `https://www.google.com/s2/favicons?domain=<dominio>&sz=128`.

### Selector de categoría

`selector-categoria.js` es el único buscador de categorías. `crearSelector({ actual, recientes, modo, onEnter, onEscape })` arma los modos **🔍 Buscar** y **☰ Por niveles**, **↻ Actualizar** y las usadas recientemente dentro de la página, y devuelve `{ nodo, cargar, leer, avisar, enfocar, apagar }`. El popup lo monta en el formulario de "Extraer" (`#categoryPicker`, con `apagar` para *No llenar categoría*); la vista previa lo abre en una ventana con `elegirCategoria`. Los dos guardan `recentCategories` y `categoryMode` en `storage.local`. Solo acepta categorías del catálogo (con código).

### Plantilla

`plantilla.xlsx` es la plantilla del sistema reordenada (ver [CONFIGURACION-REMOTA.md](CONFIGURACION-REMOTA.md#salida-excel-xlsx)). El formato condicional (rojo en `sku` y `link` según la regla de [BACKEND.md](BACKEND.md)) y la validación de datos con mensaje en esas columnas se editan en `xl/worksheets/sheet1.xml` **dentro** de `plantilla.xlsx`. `xlsx.js` no los crea: solo corre y extiende sus rangos (`sqref`) al insertar las columnas `ref_*` y al llenar filas.

### Almacenamiento

| Dónde | Clave | Contenido |
|---|---|---|
| `storage.local` | `collected` | Lista en curso: `{ clave: producto }`; clave = ASIN (Amazon) o `sitio:SKU` (otros). Ver campos abajo. |
| `storage.local` | `groups` | Grupos de la lista: `{ id: { nombre, origen, fecha, titulo, categoria, resumen, variaciones, guiaTalla, quitados } }`. `resumen`: líneas del resumen de su extracción; `variaciones` y `guiaTalla`: opciones del grupo (`true`/`false`); `quitados`: productos quitados en la vista previa. |
| `storage.local` | `jobs` | Extracciones: `{ actual, cola: [...], ultimo }`. `actual.progreso` = `{ pagina, paginas, cargados, limite, pausada, analizados, familias, verificando }` (exportación: `{ verificando, total }`); `actual.confirmacion` = `{ analizados, familias, limite }` mientras espera respuesta; `ultimo` = resultado de la última (`mensaje`, `visto`). |
| `storage.local` | `loadPrefs` | Límite de la extracción por sitio: `{ sephora: { modo: "paginas", paginas: 2, productos: 80 } }`. Sin datos = 1 página. |
| `storage.local` | `loadLimits` | Antiguo (número de productos): ya no se lee. |
| `storage.local` | `variantesLeidas` | Caché de la vista previa: `{ clave: { variantes, dims, nota, aparte, fecha, version } }`. Vale 7 días y solo con la `version` actual; se borran las de productos que ya no están en la lista. |
| `storage.local` | `remoteConfig`, `configMeta`, `settings` | Configuración remota en caché, su estado y la URL elegida en Opciones. |
| `storage.local` | `cfCategories` | Categorías en caché `{ items, fetchedAt, source, error }`. |
| `storage.local` | `extractPrefs` | `autoScroll`, `accumulate` (por defecto `true`). |
| `storage.local` | `recentCategories`, `categoryMode` | Categorías recientes y modo del selector (`search` / `browse`). |
| `storage.session` | `parcial`, `avisos` | Productos ya leídos de la extracción en curso (se guardan si se corta) y notificaciones → pestaña. |
| `storage.sync` | `h_<hash>` | Una entrada del historial por página (máx. 150; límite de ~100 KB de Chrome). |
| `localStorage` (vista previa) | `cfVistaTecnica` | Interruptor *Ver datos técnicos* (`'1'`/`'0'`), en este navegador. |
| `localStorage` (vista previa) | `cfVistaGrupos` | Vista de cada grupo por nombre: `comprimido`, `resumido` (por defecto) o `completo`. |

**Campos de un producto** (`collected`):

- Siempre: `asin` (el SKU), `link`, `nombre`, `imagen`, `precio`, `ecomerce` (con espacios), `grupo` (id), `origen`, y la categoría: `categoria`, `categoriaSecundaria`, `categoriaTerciaria`, `codCategoria`, `categoriaRuta` (vacíos = sin categoría).
- Familias: `familia` (Amazon: ASIN padre o el propio si no tiene variantes; Kate Spade: estilo que nombra la familia) o `familiaAviso` (`Familia sin verificar`); `familiaTam` (variantes de la familia); `familiaOmitidos` (productos de su familia que se omitieron por él); `hermanos` (Kate Spade: estilos de la familia).
- Variantes para la vista previa (no van al Excel): `variantes` y `variantesDims`.

## Publicar una versión nueva

1. Sube la versión en **tres sitios** (ejemplo con la 1.9.0):
   - `manifest.json` → `"version": "1.9.0"`
   - `config.json` y `config.default.json` → `"latestVersion": "1.9.0"` y sube `"revision"`
   - En el **mismo commit**, actualiza el estado al inicio de [PENDIENTES.md](PENDIENTES.md): *"Publicada: v1.9.0"* (y quítala de *"En preparación"*). Mientras la versión no se publica, PENDIENTES sigue diciendo que la publicada es la anterior. Añade la versión a [CHANGELOG.md](../CHANGELOG.md).
2. Commit y push a `main`. **Ojo:** el push publica `config.json` para todas las extensiones instaladas (aviso de versión nueva incluido). Mientras una versión está en preparación, los commits se quedan locales: el push y la etiqueta van juntos, al publicar.
3. Crea y sube la etiqueta:
   ```powershell
   git tag v1.9.0
   git push origin v1.9.0
   ```
4. El workflow [`release.yml`](../.github/workflows/release.yml):
   - comprueba que la etiqueta coincida con `manifest.json`,
   - genera `amazon-product-scraper-1.9.0.zip` (con `categories.json`, `plantilla.xlsx` e `icons/sitios/*.png` incluidos),
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
- **Excel:** generar el archivo con `buildWorkbook` en Node y leerlo con `XLSX.utils.sheet_to_json` **sin opciones**, como el backend. Comprobar que `sku` (solo Amazon), `link` (solo los demás), `codigo_categoria` y `seguimiento` llegan bien y que ninguna celda llega como `''` (ver [BACKEND.md](BACKEND.md)).
- **Scraper:** cargar `scraper.js` en **jsdom** con el HTML guardado del sitio y llamar a `globalThis.__cfScraper(siteConfig, opts)` (con `chrome.runtime.sendMessage` falso para recibir `scrapeDone`).
- **Popup:** ejecutar `popup.html` + módulos en jsdom con un `chrome` falso (`storage.local`/`sync`, `tabs`, `scripting`, `downloads`, `runtime.sendMessage`) y simular clics.
- **Vista previa:** lo mismo con `preview.html`, y comparar sus filas con el Excel que descarga (mismo número de filas y mismos `sku`/`link`).
- **Visual:** abrir el popup con datos de prueba en Chrome sin interfaz:
  ```powershell
  chrome --headless=new --screenshot=shot.png --window-size=420,560 file:///ruta/preview.html
  ```
- **Siempre**, antes de publicar, probar en Chrome real:
  - Amazon: una búsqueda, una tienda de marca y una página de producto (`/dp/…`).
  - Michael Kors: un listado y un producto.
  - Sephora: un listado con más de 60 productos (paso de página) y un producto.
  - Marc Jacobs: una categoría con más de 18 productos (tramos), su búsqueda como página y un producto.
  - Kate Spade: una categoría con más de 16 productos (páginas siguientes y familias) y un producto.
  - Elegir categoría al extraer.
  - Vista previa: quitar productos y Deshacer, **asignar categoría** (y quitarla), cambiar la **guía de tallas** de un grupo y abrir **▸ Ver variantes**.
  - Descargar el Excel, abrirlo en Google Sheets (vista previa de imágenes, desplegable de categorías y **formato condicional** en rojo de `sku`/`link`) y comprobar que el sistema lo acepta.

## Convenciones

- Interfaz y mensajes en **español**; comentarios del código también en español.
- Estilo del código: módulos pequeños, sin dependencias externas ni build.
- **Nunca** subir secretos al repo (es público). Las credenciales van en **GitHub Secrets**.
- Mensajes de commit descriptivos, en español.
