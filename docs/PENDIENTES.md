# Pendientes y próximos pasos

Estado al **14/10/2026**.

- **Publicada: v1.14.4** (14/10/2026).
- **En preparación: v1.14.5** (documentación y limpieza de código).

Lo ya hecho y probado, versión por versión, está en el [historial de versiones](../CHANGELOG.md). Aquí solo quedan las tareas abiertas.

## 1. Probar en Chrome real

- [ ] Historial sincronizado entre dos PCs con la misma cuenta de Google.

## 2. Confirmar en el sistema

- Aviso para el backend (informativo, no bloquea): `SP_CreateProductList` solo crea productos nuevos (un SKU existente se ignora) y `p_updated`/`p_created` toman `ROW_COUNT()` de `SP_GenerateUpc`, así que el conteo que devuelve no es fiable.

## 3. Publicar en Chrome Web Store (recomendado)

Instalación con un clic y actualizaciones automáticas, sin modo de desarrollador.

- [ ] Cuenta de desarrollador de Google (5 USD, pago único).
- [ ] Ficha: descripción, capturas 1280×800, icono de 128 px (ya existe en `icons/`).
- [ ] Política de privacidad breve y justificación de cada permiso.
- [ ] Revisar si los logos de las marcas del icono por sitio (`icons/sitios`, v1.12.0) chocan con la política de suplantación de la tienda; en ese caso, volver a un distintivo de texto.
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
