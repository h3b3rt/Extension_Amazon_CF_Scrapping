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
7. Al terminar, pulsa **Descargar CSV**. Opcionalmente escribe un nombre, por ejemplo `Audifonos Hyperx`, y pulsa **Descargar**.
   - Resultado: `Audifonos_Hyperx_2026-09-30_14-35.csv`
   - Sin nombre: `Plantilla_Scrapping_2026-09-30_14-35.csv`
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

**Múltiples categorías:** si la página mezcla productos de varias categorías, marca esta casilla. Las columnas de categoría quedan vacías para llenarlas a mano. Empieza siempre desmarcada.

**↻ Actualizar:** vuelve a descargar la lista de categorías. Úsalo si acaban de crear una categoría en el sistema.

## El CSV

Tiene las columnas de la plantilla de COMPRAFACIL. La extensión llena:

| Columna | Dato |
|---|---|
| SKU PADRE | ASIN |
| MARCA | Primera palabra del nombre |
| NOMBRE AMAZON | Nombre completo del producto |
| CATEGORIA PRINCIPAL / SECUNDARIA / TERCIARIA | Niveles de la categoría elegida |
| COD CATEGORIA | Código de la categoría (p. ej. `CF130704`) |
| LINK | `https://www.amazon.com/dp/<ASIN>` |
| LINK DE IMAGEN | Imagen en alta resolución |
| PRECIO USD | Precio actual (no el tachado) |
| PESO APROX | `1` por defecto |

El resto de columnas quedan vacías para completarlas en el proceso habitual.

## Panel de la lista

Debajo del botón principal verás cuántos productos hay en la lista y las páginas agregadas, por ejemplo *"Juegos de ollas · 24 productos"*. Cada nombre es un **enlace a la página** de donde salieron. Las extracciones sin categoría aparecen como **Multicategoría 1, 2…**.

## Opciones

Clic derecho en el icono → **Opciones**, o el enlace *Opciones* abajo en el popup.

- **Configuración remota:** estado de los selectores y botón **Comprobar ahora**.
- **Categorías:** cuántas hay, de dónde vienen y el botón **Actualizar categorías**.
- **Extracción:**
  - *Desplazar la página*: activado por defecto.
  - *Acumular varias páginas*: activado por defecto. Si lo desactivas, cada extracción descarga su propio CSV y el nombre se pide en el mismo formulario.
- **Historial de páginas extraídas:** tus últimas 150 páginas, con enlace, fecha y categoría. **Quitar** permite volver a extraer una página sin aviso.

## Historial personal

- Cada persona ve **solo su historial**. Se guarda en su cuenta de Google (sincronización de Chrome) y la sigue en cualquier PC.
- Se conservan las **últimas 150 páginas**.
- Descargar el CSV o limpiar la lista **no** borra el historial.
