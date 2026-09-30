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
popup.js ──executeScript──▶ scraper.js (en la pestaña de Amazon)
   │                          └─ devuelve productos según config.layouts
   ├─ config.js      ◀── config.json (GitHub) / config.default.json
   ├─ categories.js  ◀── categories.json (GitHub) / copia incluida
   ├─ history.js     ──▶ chrome.storage.sync (historial personal)
   └─ prefs.js
background.js: refresca la configuración al iniciar y cada 3 h (chrome.alarms)
```

- **Sin código remoto:** todo lo que viene de GitHub son datos (JSON). El HTML nunca se construye con `innerHTML` a partir de datos remotos; se usa `textContent`.
- **`scraper.js`** define `globalThis.__amazonScraper(config, options)` y el popup lo llama con `chrome.scripting.executeScript`. Todo lo específico de cada tipo de página está en `config.layouts`, no en el código.
- **Módulos ES:** `popup.js`, `options.js` y `background.js` (`"type": "module"`) importan `config.js`, `categories.js`, `history.js` y `prefs.js`.

### Almacenamiento

| Dónde | Clave | Contenido |
|---|---|---|
| `storage.local` | `collected` | Lista en curso: `{ ASIN: producto }` |
| `storage.local` | `remoteConfig`, `configMeta`, `settings` | Configuración remota en caché y su estado |
| `storage.local` | `cfCategories` | Categorías en caché `{ items, fetchedAt, source, error }` |
| `storage.local` | `extractPrefs` | `autoScroll`, `accumulate` (por defecto `true`) |
| `storage.local` | `recentCategories`, `categoryMode` | Categorías recientes y modo del selector (`search` / `browse`) |
| `storage.sync` | `h_<hash>` | Una entrada del historial por página (máx. 150; límite de ~100 KB de Chrome) |

## Publicar una versión nueva

1. Sube la versión en **tres sitios**:
   - `manifest.json` → `"version": "1.5.3"`
   - `config.json` y `config.default.json` → `"latestVersion": "1.5.3"` y sube `"revision"`
2. Commit y push a `main`.
3. Crea y sube la etiqueta:
   ```powershell
   git tag v1.5.3
   git push origin v1.5.3
   ```
4. El workflow [`release.yml`](../.github/workflows/release.yml):
   - comprueba que la etiqueta coincida con `manifest.json`,
   - genera `amazon-product-scraper-1.5.3.zip` (con `categories.json` incluido),
   - lo publica en **Releases**.
5. Las extensiones instaladas muestran el aviso de versión nueva.

> Si solo cambian selectores o columnas del CSV, **no hace falta versión nueva**: basta con editar `config.json` y subir `revision`. Ver [CONFIGURACION-REMOTA.md](CONFIGURACION-REMOTA.md).

`tools/empaquetar.ps1` genera el mismo zip en `dist/` para subirlo a mano, por ejemplo a Chrome Web Store.

## Probar

No hay suite de pruebas automáticas en el repo. Durante el desarrollo se probó así:

- **Sintaxis:** `node --input-type=module --check < popup.js`, y lo mismo con cada módulo.
- **Scraper:** cargar `scraper.js` en **jsdom** con HTML de ejemplo de Amazon y llamar a `__amazonScraper(config)`.
- **Popup:** ejecutar `popup.html` + módulos en jsdom con un `chrome` falso (`storage.local`/`sync`, `tabs`, `scripting`, `downloads`) y simular clics.
- **Visual:** abrir el popup con datos de prueba en Chrome sin interfaz:
  ```powershell
  chrome --headless=new --screenshot=shot.png --window-size=420,560 file:///ruta/preview.html
  ```
- **Siempre**, antes de publicar: probar en Chrome real una búsqueda y una tienda de marca, elegir categoría y descargar el CSV.

## Convenciones

- Interfaz y mensajes en **español**; comentarios del código también en español.
- Estilo del código: módulos pequeños, sin dependencias externas ni build.
- **Nunca** subir secretos al repo (es público). Las credenciales van en **GitHub Secrets**.
- Mensajes de commit descriptivos, en español.
