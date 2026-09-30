# Categorías

Las categorías del sistema COMPRAFACIL tienen 3 niveles y un código:

```json
{ "codigo": "CF010101", "primaria": "Hogar", "secundaria": "Menaje de Cocina",
  "terciaria": "Juegos de ollas", "ruta": "Hogar > Menaje de Cocina > Juegos de ollas" }
```

Hoy son unas 410.

## Cómo llegan a cada extensión

```
API del sistema ──(workflow cada 3 h)──▶ categories.json en GitHub ──(cada hora)──▶ extensiones
                                                                       └─ copia incluida en el .zip (respaldo sin conexión)
```

1. El workflow [`categorias.yml`](../.github/workflows/categorias.yml) se ejecuta cada 3 horas.
   - Inicia sesión en `POST https://api.comprafacil.pics/auth/user/login` y toma el token de `data.token`.
   - Llama a `GET https://api.comprafacil.pics/category/list/full-path` con `Authorization: <token>`, sin "Bearer".
   - Si la lista cambió, actualiza [`categories.json`](../categories.json) y hace commit. Si no cambió, no hace nada.
2. Cada extensión descarga `categories.json` desde GitHub cada hora, o al pulsar **↻ Actualizar**.
3. Si GitHub no responde, la extensión usa la última lista descargada o, en su defecto, la copia incluida en el paquete.

**Ningún usuario necesita token ni credenciales.** Solo el workflow las tiene, guardadas como secrets de GitHub.

## Configuración necesaria (una vez)

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `CF_EMAIL` | Correo de una cuenta del sistema COMPRAFACIL. Mejor una cuenta dedicada, p. ej. `categorias.bot@…`. |
| `CF_PASSWORD` | Contraseña de esa cuenta |

> **Estado al 30/09/2026:** estos secrets **todavía no están creados**. Mientras falten, el workflow termina con un aviso (sin error) y se mantiene la lista actual, que se cargó a mano desde un JSON exportado del sistema.

GitHub guarda los secrets cifrados. En los registros aparecen como `***`, y el token de sesión también se oculta.

## Forzar una actualización

Si se crea una categoría y se necesita ya:

1. GitHub → pestaña **Actions** → **Actualizar categorías** → **Run workflow** → **Run workflow**.
2. Cuando termine (≈30 s), en la extensión pulsa **↻ Actualizar** en el formulario de categoría.

## Carga manual (si la API no está disponible)

1. Consigue el JSON de categorías, en el formato de arriba: un array o `{ "data": [...] }`.
2. Guárdalo como `categories.json` con esta forma:
   ```json
   { "updatedAt": "2026-09-30T00:00:00Z", "data": [ ... ] }
   ```
3. Haz commit y push a `main`. En menos de una hora las extensiones lo toman, o al momento con ↻.

## Mensajes del workflow

| Mensaje | Significado |
|---|---|
| `Faltan los secrets CF_EMAIL y/o CF_PASSWORD` (aviso) | No están configurados. Se conserva la lista actual. |
| `No se pudo iniciar sesión (HTTP xxx)` | Correo o contraseña incorrectos, o la cuenta está bloqueada. |
| `HTTP 401/403: la API rechazó el token de sesión` | El backend cambió la autenticación del endpoint. Avisar a backend. |
| `El endpoint no existe (404)` (aviso) | La ruta no está desplegada. Se conserva la lista actual. |
| `Sin cambios en las categorías.` | Todo bien: la lista ya estaba al día. |

## Historia del endpoint

- Primero se pensó con un `API_TOKEN` fijo; el backend lo **retiró** el 30/09/2026 y el secret se borró.
- Ahora el endpoint usa el **JWT de inicio de sesión**, por eso el workflow inicia sesión en cada ejecución.
