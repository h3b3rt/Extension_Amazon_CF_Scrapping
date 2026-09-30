# Amazon Product Scraper · COMPRAFACIL

Extensión para Google Chrome (Manifest V3) que extrae productos de páginas de **Amazon.com** y los exporta al **CSV de COMPRAFACIL**, con la categoría del sistema (principal, secundaria, terciaria y código).

## Descargar

- **Última versión:** https://github.com/h3b3rt/Extension_Amazon_CF_Scrapping/releases/latest
  Descarga el archivo `amazon-product-scraper-X.Y.Z.zip` de esa página.
- Instrucciones paso a paso: **[docs/INSTALACION.md](docs/INSTALACION.md)**

## Qué hace

- Extrae ASIN, nombre, marca, precio (sin tomar el precio tachado), imagen en alta resolución y enlace de cada producto.
- Funciona en resultados de búsqueda y en tiendas de marca: `ProductUIRender`, `ProductGridItem`, `ProductShowcase` y `EditorialTile`.
- Desplaza la página sola para cargar todos los productos y acumula varias páginas en un solo CSV, sin repetir productos.
- Para cada extracción pide la categoría: se puede **buscar** o elegir **por niveles**. Las 410 categorías del sistema se actualizan solas.
- Avisa si una página ya se extrajo antes y ofrece reemplazar los datos. El historial es personal y se sincroniza con la cuenta de Google.
- El nombre del archivo es opcional: `Audifonos_Hyperx_2026-09-30_14-35.csv`.
- **Se actualiza a distancia:** los selectores de Amazon y las categorías se corrigen desde este repositorio, sin reinstalar.

## Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| [INSTALACION.md](docs/INSTALACION.md) | Cualquier usuario | Instalar, actualizar y desinstalar |
| [GUIA-DE-USO.md](docs/GUIA-DE-USO.md) | Cualquier usuario | Cómo extraer, elegir categorías, descargar el CSV y usar el historial |
| [CATEGORIAS.md](docs/CATEGORIAS.md) | Administrador | De dónde salen las categorías, cómo se actualizan y qué configurar |
| [CONFIGURACION-REMOTA.md](docs/CONFIGURACION-REMOTA.md) | Administrador | Corregir selectores o añadir tipos de página sin publicar una versión |
| [DESARROLLO.md](docs/DESARROLLO.md) | Quien programa | Preparar otra PC, arquitectura, pruebas y cómo publicar versiones |
| [PENDIENTES.md](docs/PENDIENTES.md) | Todos | Tareas abiertas y próximos pasos |

## Estructura del repositorio

```
├── manifest.json            Definición de la extensión (versión, permisos)
├── popup.html / popup.js    Ventana principal (extraer, categoría, lista, CSV)
├── options.html / options.js  Página de Opciones (estado, categorías, historial)
├── scraper.js               Se inyecta en Amazon y extrae los productos
├── config.js                Carga y validación de la configuración remota
├── categories.js            Lista de categorías: GitHub + copia incluida
├── history.js               Historial de páginas (chrome.storage.sync)
├── prefs.js                 Preferencias de extracción
├── background.js            Service worker: sincronización periódica
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
