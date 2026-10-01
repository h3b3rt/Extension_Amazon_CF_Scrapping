# Guía de uso

## Flujo normal

1. Abre en Amazon.com una **búsqueda** o una **tienda de marca**.
2. Pulsa el icono de la extensión → **Extraer productos**.
3. Si esa página **ya se extrajo antes**, aparece un aviso con la fecha, la categoría y los productos. Elige:
   - **Reemplazar datos anteriores**: quita de la lista los productos de la extracción anterior y la hace de nuevo.
   - **Cancelar**.
4. Elige la **categoría** de los productos (ver abajo) y pulsa **Extraer**.
5. La extensión baja la página sola para cargar todos los productos y los añade a la lista. **No cierres el popup mientras trabaja.**
6. Repite con otras páginas. La lista acumula productos sin repetir ASIN.
7. Al terminar, pulsa **Descargar Excel**. Opcionalmente escribe un nombre, por ejemplo `Audifonos Hyperx`, y pulsa **Descargar**.
   - Resultado: `Audifonos_Hyperx_2026-09-30_14-35.xlsx`
   - Sin nombre: `Plantilla_Scraping_2026-09-30_14-35.xlsx`
8. Pulsa **Limpiar** para empezar una lista nueva.

## Elegir la categoría

Hay dos formas. La extensión recuerda la última que usaste.

**🔍 Buscar:** escribe cualquier parte del nombre o el código.
- `ollas` → *Hogar / Menaje de Cocina / Juegos de ollas*
- `zapatillas mujer` → *Calzado / Calzado para Mujer / Zapatillas Deportivas*
- `CF0101` → todas las de Hogar / Menaje de Cocina

No distingue tildes ni mayúsculas, y las palabras pueden ir en cualquier orden. Usa ↑ ↓ para moverte y **Enter** para elegir. Con el campo vacío aparecen las categorías usadas recientemente.

**☰ Por niveles:** elige **Principal → Secundaria → Terciaria**. Cada lista muestra solo las opciones del nivel anterior.

Al elegir, debajo aparece el **código** (por ejemplo `Código: CF130704`).

**Múltiples categorías:** si la página mezcla productos de varias categorías, marca esta casilla. `Buscar categoria` y `codigo_categoria` quedan vacías para elegirlas fila por fila con el desplegable de la plantilla. Empieza siempre desmarcada.

**↻ Actualizar:** vuelve a descargar la lista de categorías. Úsalo si acaban de crear una categoría en el sistema.

## El Excel

Es la **plantilla de scraping del sistema** (`Plantilla_Scraping_General.xlsx`) ya llenada: mismas columnas, desplegables y colores. Se sube tal cual al sistema; el bot de scraping extrae el resto de datos.

**Lo que llena la extensión:**

| Columna | Valor |
|---|---|
| `ecomerce` | `Amazon` |
| `sku` | ASIN |
| `condicion` | `Reacondicionado` si el título dice *Renewed* / *Refurbished*; si no, `Nuevo`. **Revísala.** |
| `link` | `https://www.amazon.com/dp/<ASIN>` |
| `Buscar categoria` | Ruta de la categoría elegida en el popup (vacía con *Múltiples categorías*) |
| `codigo_categoria` | Código de esa categoría. Es una fórmula: si cambias `Buscar categoria`, se actualiza sola |
| `seguimiento` | `Scraping` |

**Lo que llena la persona:** `variacion` (Sí = el bot extrae todas las variantes y agrupa la familia) y `guia_talla` (Sí / No). Quedan vacías. El resto de columnas de la plantilla (`marca`, `nombre`, `precio`, `peso`…) se dejan **vacías**: si se llenan, el sistema las toma como valores fijos.

**Columnas de ayuda** (después de `precio`; el sistema las ignora):

| Columna | Para qué |
|---|---|
| `ref_imagen_link` | URL de la imagen |
| `ref_imagen` | Vista previa con `=IMAGE()`. Funciona en **Google Sheets** (en LibreOffice o Excel antiguo muestra `#NAME?`) |
| `ref_nombre` / `ref_marca` / `ref_precio` | Nombre, marca y precio que muestra Amazon, solo como referencia |
| `ref_duplicado` | `Posible variante: fila N` cuando otra fila tiene el mismo nombre o la misma imagen. Suele ser otro color o talla del mismo producto: deja una sola fila y marca `variacion = Sí` |

**Para que la carga no pierda filas:**
- Sube el archivo como **.xlsx** (en Google Sheets: *Archivo → Descargar → Microsoft Excel*). **Nunca como CSV**: en CSV las celdas vacías llegan como texto vacío y el sistema descarta esas filas sin avisar.
- No dejes un `sku` "vacío" con un espacio o con una fórmula que devuelva `""`: el sistema descarta la fila sin avisar. Para quitar un producto, borra la fila entera.
- No uses guiones en `sku`: el sistema corta el valor en el primer `-`.
- El sistema solo **crea** productos: si un SKU ya existe, la fila se ignora (no se actualiza).
- `Plantilla` debe seguir siendo la **primera** pestaña.

## Panel de la lista

Debajo del botón principal verás cuántos productos hay en la lista y las páginas agregadas, por ejemplo *"Juegos de ollas · 24 productos"*. Cada nombre es un **enlace a la página** de donde salieron. Las extracciones sin categoría aparecen como **Multicategoría 1, 2…**.

## Opciones

Clic derecho en el icono → **Opciones**, o el enlace *Opciones* abajo en el popup.

- **Configuración remota:** estado de los selectores y botón **Comprobar ahora**.
- **Categorías:** cuántas hay, de dónde vienen y el botón **Actualizar categorías**.
- **Extracción:**
  - *Desplazar la página*: activado por defecto.
  - *Acumular varias páginas*: activado por defecto. Si lo desactivas, cada extracción descarga su propio Excel y el nombre se pide en el mismo formulario.
- **Historial de páginas extraídas:** tus últimas 150 páginas, con enlace, fecha y categoría. **Quitar** permite volver a extraer una página sin aviso.

## Historial personal

- Cada persona ve **solo su historial**. Se guarda en su cuenta de Google (sincronización de Chrome) y la sigue en cualquier PC.
- Se conservan las **últimas 150 páginas**.
- Descargar el Excel o limpiar la lista **no** borra el historial.
