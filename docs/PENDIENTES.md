# Pendientes y próximos pasos

Estado al **30/09/2026** (versión publicada: **v1.5.2**).

## 1. Categorías automáticas desde la API
- [ ] Crear los secrets **`CF_EMAIL`** y **`CF_PASSWORD`** en GitHub. Idealmente con una cuenta dedicada del sistema. Ver [CATEGORIAS.md](CATEGORIAS.md).
- [ ] Lanzar **Actions → Actualizar categorías → Run workflow** y confirmar que termina con *"Categorías recibidas: ~410"*.

Mientras tanto se usan las 410 categorías cargadas a mano el 29/09/2026.

## 2. Probar en Chrome real
Varias funciones solo se probaron en simulación (jsdom) y con capturas de Chrome sin interfaz:
- [ ] Buscador de categorías y modo **Por niveles**.
- [ ] Botón **↻ Actualizar** categorías.
- [ ] Historial sincronizado entre dos PCs con la misma cuenta de Google.
- [ ] Extracción en una tienda de marca con **EditorialTile**.

## 3. Publicar en Chrome Web Store (recomendado)
Instalación con un clic y actualizaciones automáticas, sin modo de desarrollador.
- [ ] Cuenta de desarrollador de Google (5 USD, pago único).
- [ ] Ficha: descripción, capturas 1280×800, icono de 128 px (ya existe en `icons/`).
- [ ] Política de privacidad breve y justificación de cada permiso.
- [ ] Publicar como **No listada** y compartir el enlace con el equipo.

## 4. Historial en servidor, por cuenta (pospuesto)
Hoy el historial es personal y vive en la sincronización de Chrome (máx. 150 páginas). Se planteó llevarlo a un servidor propio para:
- quitar el límite de 150 páginas y tener respaldo;
- avisar si **otra persona** ya extrajo esa página (*"ya la extrajo maria@… el 29/09"*).

Diseño acordado:
- **Servicio:** Node.js + SQLite en Docker, en el **VPS Contabo de la empresa**. La IP y el acceso los tiene TI; no se publican aquí.
- **Dominio:** `contenido.comprafacil-usa.com`, que ya apunta al VPS.
- **Publicación:** el VPS usa Dokploy con **Traefik**. Sin acceso al panel de Dokploy, se puede desplegar con `docker compose` en la red `dokploy-network`, con etiquetas de Traefik (`certResolver: letsencrypt`) para el HTTPS.
- **Identidad:** "Iniciar sesión con Google" en la extensión (`chrome.identity`), verificando el token en el servidor. Se acordó aceptar **cualquier cuenta de Google**.
- **Efecto secundario:** requiere un **ID de extensión fijo** (clave `key` en `manifest.json`) y un **cliente OAuth** en Google Cloud Console. Al fijar el ID, Chrome la trata como una extensión nueva: cada PC debe **cargarla de nuevo una vez** y pierde la lista en curso y el historial local.
- **Acceso SSH:** desde la PC original se configuró una llave dedicada. En otra PC habrá que autorizar una llave nueva (pedir a TI o usar la contraseña del VPS una vez).
