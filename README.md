# COMPRAFACIL Scraper

Extensión para Google Chrome (Manifest V3) que extrae productos de **Amazon.com**, **Michael Kors**, **Sephora**, **Marc Jacobs** y **Kate Spade** y los exporta a la **plantilla de scraping de COMPRAFACIL** (.xlsx), con la categoría del sistema y columnas de ayuda (imagen, nombre, marca, precio).

## Descargar

- **Última versión:** https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping/releases/latest
  Descarga el archivo `amazon-product-scraper-X.Y.Z.zip` de esa página.
- Instrucciones paso a paso: **[docs/INSTALACION.md](docs/INSTALACION.md)**

## Qué hace

- Genera el Excel listo para subir al sistema: `ecomerce`, `sku` (ASIN), `link`, `condicion` (Nuevo / Reacondicionado), categoría y `seguimiento`. Nombre, marca, precio e imagen van solo como referencia (`ref_*`), con vista previa de la imagen en Google Sheets.
- **Amazon:** resultados de búsqueda y tiendas de marca (`ProductUIRender`, `ProductGridItem`, `ProductShowcase` y `EditorialTile`). En la página de un producto (`/dp/…`) extrae solo ese producto, sin las sugerencias. En búsquedas sigue con las páginas siguientes hasta el máximo indicado, sin anuncios (*Patrocinado*); también lee las portadas de categoría (`/b?node=…`). Deja **un producto por familia** (variantes de color o talla del mismo padre), porque el sistema descarga la familia completa de cada ASIN.
- **Michael Kors:** búsquedas y categorías, pulsando **Load More** hasta el máximo de productos que indiques (con el avance en el popup), y páginas de producto. El SKU sale del link `/<ID>.html`, igual que en el sistema.
- **Sephora:** búsquedas, categorías y marcas, leyendo los productos mientras baja la página y pasando con **Show More Products** hasta el máximo indicado, y páginas de producto. El sistema saca el SKU (`skuId`) y el ID `P…` del link, así que la columna `sku` queda vacía. Desde otra región (por ejemplo `sephora.fr`) ofrece abrir la versión de EE. UU.
- **Marc Jacobs** (solo `/us-en/`): categorías y búsquedas, descargando en segundo plano los productos que carga el scroll hasta el máximo indicado, y páginas de producto. El sistema solo lee la columna `sku` y la corta en el primer `-`, así que la extensión escribe el modelo base (`H004L01PF21`) y deja una fila por modelo. Con la búsqueda abierta en el panel, ofrece abrirla como página.
- **Kate Spade** (solo `www.katespade.com`, sin el outlet): categorías, filtros y búsquedas, descargando en segundo plano las páginas que carga el scroll (`?page=N`) hasta el máximo indicado, y páginas de producto. Escribe el estilo sin color (`KD120`) y deja **un producto por familia**, siempre: una familia reúne varios estilos y el sistema crearía cada uno aparte. La familia sale de la página de cada producto. Desde otra región ofrece abrir la versión de EE. UU.
- El popup y el icono toman el nombre del sitio (*Michael Kors Product Scraper*). En otras páginas muestran *COMPRAFACIL Scraper* y la lista de sitios disponibles. Un mismo Excel puede mezclar sitios.
- Las extracciones siguen **en segundo plano** aunque cierres el popup, se ponen **en cola** si ya hay una en curso y avisan con una notificación al terminar. Se pueden detener guardando lo leído.
- Cada extracción forma un **grupo** con nombre (renombrable con doble clic), con su resumen desplegable y 🗑 para eliminarlo, que sale en la columna `ref_grupo` del Excel unificado.
- Desplaza la página sola para cargar todos los productos y acumula varias páginas en un solo Excel, sin repetir productos.
- Para cada extracción pide la categoría: se puede **buscar** o elegir **por niveles**. Las 410 categorías del sistema se actualizan solas.
- Avisa si una página ya se extrajo antes y ofrece reemplazar los datos. El historial es personal y se sincroniza con la cuenta de Google.
- El nombre del archivo es opcional: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`.
- **Se actualiza a distancia:** los selectores de Amazon y las categorías se corrigen desde este repositorio, sin reinstalar.

## Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| [INSTALACION.md](docs/INSTALACION.md) | Cualquier usuario | Instalar, actualizar y desinstalar |
| [GUIA-DE-USO.md](docs/GUIA-DE-USO.md) | Cualquier usuario | Cómo extraer, elegir categorías, descargar el Excel y usar el historial |
| [CATEGORIAS.md](docs/CATEGORIAS.md) | Administrador | De dónde salen las categorías, cómo se actualizan y qué configurar |
| [CONFIGURACION-REMOTA.md](docs/CONFIGURACION-REMOTA.md) | Administrador | Corregir selectores o añadir tipos de página sin publicar una versión |
| [DESARROLLO.md](docs/DESARROLLO.md) | Quien programa | Preparar otra PC, arquitectura, pruebas y cómo publicar versiones |
| [PENDIENTES.md](docs/PENDIENTES.md) | Todos | Tareas abiertas y próximos pasos |

## Estructura del repositorio

```
├── manifest.json            Definición de la extensión (versión, permisos)
├── popup.html / popup.js    Ventana principal (extraer, categoría, lista, Excel)
├── xlsx.js                  Genera el Excel desde plantilla.xlsx
├── plantilla.xlsx           Plantilla de scraping del sistema
├── options.html / options.js  Página de Opciones (estado, categorías, historial)
├── scraper.js               Se inyecta en la pestaña del sitio y extrae los productos
├── config.js                Carga y validación de la configuración remota
├── categories.js            Lista de categorías: GitHub + copia incluida
├── history.js               Historial de páginas (chrome.storage.sync)
├── groups.js                Grupos de la lista (nombre, migración, orden del Excel)
├── sites.js                 Sitios disponibles: detección, configuración y título
├── prefs.js                 Preferencias de extracción
├── jobs.js                  Cola de extracciones y guardado de su resultado
├── export.js                Descarga del Excel (popup y service worker)
├── familias.js              Familias de Amazon y Kate Spade (un producto por familia)
├── background.js            Service worker: cola de extracciones, aviso al terminar, sincronización
├── config.default.json      Configuración incluida en la extensión
├── config.json              Configuración remota (la leen todas las extensiones)
├── categories.json          Lista de categorías (la mantiene un workflow)
├── icons/                   Iconos de la extensión
├── tools/                   Scripts de PowerShell para empaquetar y actualizar
├── docs/                    Documentación
└── .github/workflows/
    ├── release.yml          Publica el .zip al crear una etiqueta vX.Y.Z
    └── categorias.yml       Actualiza categories.json desde la API cada 3 horas
```
