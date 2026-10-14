# COMPRAFACIL Scraper

Extensión para Google Chrome (Manifest V3) que extrae productos de **Amazon.com**, **Michael Kors**, **Sephora**, **Marc Jacobs** y **Kate Spade** y los exporta a la **plantilla de scraping de COMPRAFACIL** (.xlsx), con la categoría del sistema y columnas de referencia (imagen, nombre, marca, precio).

## Descargar

- **Última versión:** <https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping/releases/latest>
  Descarga el archivo `amazon-product-scraper-X.Y.Z.zip` de esa página.
- Instrucciones paso a paso: **[docs/INSTALACION.md](docs/INSTALACION.md)**

## Qué hace

### El Excel

- Sale listo para subir al sistema, con `ecomerce`, `condicion` (Nuevo / Reacondicionado), las opciones del grupo (`variacion`, `guia_talla`), la categoría y `seguimiento`.
- **Amazon** lleva el ASIN en `sku` (sin `link`). **Los demás sitios** llevan el `link` (sin `sku`): el sistema saca el SKU del link.
- Nombre, marca, precio e imagen van solo como referencia (columnas `ref_*`), con vista previa de la imagen en Google Sheets.
- Un mismo Excel puede mezclar sitios y grupos, sin repetir productos. El nombre del archivo es opcional: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`.

### Sitios

En todos los sitios se extraen búsquedas, listados y la página de un producto (solo ese producto, con la variante elegida). Los anuncios (*Patrocinado* / *Sponsored*) nunca se extraen.

| Sitio | Páginas | Páginas siguientes | Notas |
| --- | --- | --- | --- |
| **Amazon** | Búsquedas, tiendas de marca, portadas de categoría (`/b?node=…`), producto (`/dp/…`) | Descarga en segundo plano, por páginas o por productos | Con **Extraer variantes** marcada (por defecto desmarcada en Amazon), un producto por familia (variantes de color o talla), porque el sistema descarga la familia completa de cada ASIN. Sin ella, entran todos los ASIN. |
| **Michael Kors** | Búsquedas, categorías, producto | Descarga en segundo plano los tramos de **Load More** | El SKU sale del link `/<ID>.html`, igual que en el sistema. |
| **Sephora** | Búsquedas, categorías, marcas, producto | Categorías y marcas: datos de la página (`?currentPage=N`). Búsquedas: lee mientras baja y pasa con **Show More Products** | El sistema saca el `skuId` y el ID `P…` del link. Desde otra región ofrece abrir la versión de EE. UU. |
| **Marc Jacobs** (solo `/us-en/`) | Categorías, búsquedas, producto | Descarga en segundo plano los tramos del scroll | Una fila por modelo base (`H004L01PF21`). Con la búsqueda abierta en el panel, ofrece abrirla como página. Desde otra región ofrece EE. UU. |
| **Kate Spade** (solo `www.katespade.com`, sin el outlet) | Categorías, filtros, búsquedas, producto | Descarga en segundo plano las páginas del scroll (`?page=N`) | Un producto por familia, siempre: una familia reúne varios estilos. La familia sale de la página de cada producto. Desde otra región ofrece EE. UU. |

El popup y el icono toman el nombre y el logo del sitio (*Michael Kors Product Scraper*). En otras páginas muestran *COMPRAFACIL Scraper*, la bolsa naranja y la lista de sitios disponibles.

### Extracción

- Límite por **páginas** (desde la página abierta, hasta 10) o por **productos**, recordado por sitio.
- Opciones del grupo: **Extraer variantes** (fija desde la extracción; marcada por defecto salvo en Amazon y Sephora) y **Guía de tallas** (marcada por defecto; se cambia por grupo en la vista previa).
- Las extracciones siguen **en segundo plano** aunque cierres el popup, se ponen **en cola** si ya hay una en curso y avisan con una notificación al terminar. Se pueden detener guardando lo leído.
- Cada extracción forma un **grupo** con nombre (renombrable con doble clic), resumen desplegable (con la duración) y 🗑 para eliminarlo. El grupo sale en la columna `ref_grupo` del Excel.
- Para cada extracción pide la categoría: se puede **buscar** o elegir **por niveles**. Las 410 categorías del sistema se actualizan solas.
- Avisa si una página ya se extrajo antes y ofrece reemplazar los datos. El historial es personal y se sincroniza con la cuenta de Google (últimas 150 páginas).

### Vista previa

Pestaña con los mismos productos del Excel, para revisarlos antes de descargar: avisos explicados, variantes de cada familia, quitar productos y asignar la categoría.
Detalle en la [guía de uso](docs/GUIA-DE-USO.md#vista-previa-del-excel).

### Se actualiza a distancia

Los selectores de los sitios, los ajustes del Excel y las categorías se corrigen desde este repositorio (`config.json`, `categories.json`), sin reinstalar. Las funciones nuevas requieren instalar la versión nueva.

## Documentación

| Documento | Para quién | Contenido |
| --- | --- | --- |
| [INSTALACION.md](docs/INSTALACION.md) | Cualquier usuario | Instalar, actualizar y desinstalar |
| [GUIA-DE-USO.md](docs/GUIA-DE-USO.md) | Cualquier usuario | Cómo extraer, elegir categorías, revisar la vista previa, descargar el Excel y usar el historial |
| [CHANGELOG.md](CHANGELOG.md) | Todos | Historial de versiones: qué cambió en cada una |
| [CATEGORIAS.md](docs/CATEGORIAS.md) | Administrador | De dónde salen las categorías, cómo se actualizan y qué configurar |
| [CONFIGURACION-REMOTA.md](docs/CONFIGURACION-REMOTA.md) | Administrador | Corregir selectores o añadir tipos de página sin publicar una versión |
| [BACKEND.md](docs/BACKEND.md) | Administrador / quien programa | Cómo lee el sistema el Excel de cada sitio (`sku`, `link`, filas que descarta) |
| [DESARROLLO.md](docs/DESARROLLO.md) | Quien programa | Preparar otra PC, arquitectura, pruebas (`tests/`) y cómo publicar versiones |
| [PENDIENTES.md](docs/PENDIENTES.md) | Todos | Versión publicada, tareas abiertas y próximos pasos |

## Estructura del repositorio

```text
├── manifest.json                  Definición de la extensión (versión, permisos); su carpeta es la que se carga en Chrome
├── config.json                    Configuración remota (todas las extensiones la leen de esta ruta: no se mueve)
├── config.default.json            Configuración incluida en la extensión
├── categories.json                Lista de categorías (la mantiene un workflow; también se lee de esta ruta)
├── src/
│   ├── background/
│   │   └── background.js          Service worker: cola de extracciones, aviso al terminar, icono por pestaña
│   ├── inyectados/                Scripts clásicos que se inyectan en la pestaña del sitio
│   │   ├── scraper.js             Extrae los productos
│   │   └── familias.js            Familias de Amazon y Kate Spade y sus variantes (también lo importan los módulos)
│   ├── popup/                     popup.html / popup.js: ventana principal (extraer, categoría, lista, Excel)
│   ├── preview/                   preview.html / preview.js: vista previa del Excel (en una pestaña)
│   ├── options/                   options.html / options.js: Opciones (configuración, estado, categorías, historial)
│   └── comun/                     Módulos compartidos
│       ├── config.js              Carga y validación de la configuración remota
│       ├── sites.js               Sitios disponibles: detección, configuración, título e icono
│       ├── jobs.js                Cola de extracciones y guardado de su resultado
│       ├── groups.js              Grupos de la lista (nombre, migración, orden del Excel)
│       ├── history.js             Historial de páginas (chrome.storage.sync)
│       ├── categories.js          Lista de categorías: GitHub, caché y copia incluida
│       ├── selector-categoria.js  Selector de categoría (popup y vista previa)
│       ├── prefs.js               Preferencias de extracción
│       ├── xlsx.js                Genera el Excel desde assets/plantilla.xlsx (y las filas de la vista previa)
│       ├── export.js              Descarga del Excel (popup y service worker)
│       ├── descarga.js            Botón "Descargar Excel" del popup y de la vista previa
│       └── dom.js                 Ayudas de DOM compartidas
├── assets/
│   ├── plantilla.xlsx             Plantilla de scraping del sistema
│   └── icons/                     Iconos de la extensión (icon.svg: dibujo original; sitios/: uno por sitio)
├── tests/                         Pruebas automáticas (Node + jsdom); no van en el paquete
├── tools/                         Scripts para empaquetar, actualizar y generar los iconos por sitio
├── docs/                          Documentación
├── CHANGELOG.md                   Historial de versiones
├── CLAUDE.md                      Notas para el asistente de programación
└── .github/workflows/
    ├── release.yml                Publica el .zip al crear una etiqueta vX.Y.Z
    └── categorias.yml             Actualiza categories.json desde la API cada 3 horas
```
