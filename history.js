// Historial de páginas ya extraídas, para avisar antes de agregar dos veces
// la misma página. Se conserva aunque se vacíe la lista o se descargue el Excel.
//
// Es personal: vive en chrome.storage.sync, así que sigue a la cuenta de Google
// del perfil de Chrome (con la sincronización activada) y cada persona ve solo
// el suyo. storage.sync admite ~100 KB y 8 KB por clave, por eso cada página se
// guarda en su propia clave ("h_<hash>") y se conservan las más recientes.

const PREFIX = 'h_';
const MAX_ENTRIES = 150;
const LEGACY_KEY = 'history'; // versiones anteriores: todo en storage.local
const area = chrome.storage.sync;

// Parámetros que cambian el contenido de la página. El resto (ref_, qid, crid,
// sprefix…) son de rastreo y se descartan para comparar URLs.
const DEFAULT_KEEP_PARAMS = ['k', 'i', 'rh', 'page', 'node', 'bbn', 's', 'field-keywords', 'low-price', 'high-price', 'me', 'srs'];

export function normalizeUrl(raw, config = {}) {
  const u = new URL(raw);
  const keep = new Set(config.history?.keepParams || DEFAULT_KEEP_PARAMS);
  const params = [...u.searchParams]
    .filter(([k, v]) => keep.has(k) && !(k === 'page' && v === '1'))
    .sort(([a], [b]) => a.localeCompare(b));
  const path = u.pathname.replace(/\/ref=[^/]*$/, '').replace(/\/+$/, '') || '/';
  const qs = new URLSearchParams(params).toString();
  return `${u.origin}${path}${qs ? `?${qs}` : ''}`;
}

// Clave corta y estable por URL (hash FNV-1a de 32 bits).
function keyFor(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return PREFIX + (h >>> 0).toString(36);
}

// Solo lo necesario, para ahorrar espacio en storage.sync.
function compact(url, e) {
  return {
    url,
    fecha: e.fecha,
    categoria: e.categoria || '',
    codigo: e.codigo || '',
    productos: e.productos || 0,
    titulo: (e.titulo || '').slice(0, 80),
  };
}

async function readRows() {
  const all = await area.get(null);
  return Object.entries(all).filter(([k, v]) => k.startsWith(PREFIX) && v?.url);
}

// Borra las entradas más antiguas hasta dejar `max`.
async function trim(max) {
  const rows = await readRows();
  if (rows.length <= max) return;
  rows.sort(([, a], [, b]) => b.fecha.localeCompare(a.fecha));
  await area.remove(rows.slice(max).map(([k]) => k));
}

// Pasa una sola vez el historial antiguo (storage.local) al sincronizado.
let migration;
function migrateLegacy() {
  migration ??= (async () => {
    const { [LEGACY_KEY]: legacy } = await chrome.storage.local.get(LEGACY_KEY);
    if (!legacy) return;
    const recientes = Object.entries(legacy)
      .sort(([, a], [, b]) => b.fecha.localeCompare(a.fecha))
      .slice(0, MAX_ENTRIES);
    try {
      await area.set(Object.fromEntries(recientes.map(([url, e]) => [keyFor(url), compact(url, e)])));
      await chrome.storage.local.remove(LEGACY_KEY);
    } catch (e) {
      console.warn('[Amazon Scraper] No se pudo migrar el historial', e);
    }
  })();
  return migration;
}

// { url: entrada } del usuario actual.
export async function getHistory() {
  await migrateLegacy();
  return Object.fromEntries((await readRows()).map(([, e]) => [e.url, e]));
}

export async function saveHistoryEntry(url, entry) {
  await migrateLegacy();
  const item = { [keyFor(url)]: compact(url, entry) };
  try {
    await area.set(item);
  } catch {
    // Cuota llena: liberar espacio y reintentar.
    await trim(MAX_ENTRIES - 30);
    await area.set(item);
  }
  await trim(MAX_ENTRIES);
}

export async function removeHistoryEntry(url) {
  await area.remove(keyFor(url));
}

export async function clearHistory() {
  await area.remove((await readRows()).map(([k]) => k));
  await chrome.storage.local.remove(LEGACY_KEY);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}
