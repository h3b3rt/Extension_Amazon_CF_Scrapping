// Historial de páginas ya extraídas, para avisar antes de agregar dos veces
// la misma página. Se conserva aunque se vacíe la lista o se descargue el CSV.

const HISTORY_KEY = 'history';
const MAX_ENTRIES = 500;

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

export async function getHistory() {
  const { [HISTORY_KEY]: history = {} } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

export async function saveHistoryEntry(url, entry) {
  const history = await getHistory();
  history[url] = entry;
  // Conservar solo las más recientes.
  const trimmed = Object.fromEntries(
    Object.entries(history).sort(([, a], [, b]) => b.fecha.localeCompare(a.fecha)).slice(0, MAX_ENTRIES),
  );
  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
}

export async function removeHistoryEntry(url) {
  const history = await getHistory();
  delete history[url];
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}
