import {
  getConfig, getConfigMeta, getSettings, saveSettings, refreshRemoteConfig, resetRemoteConfig, extensionVersion,
} from './config.js';
import { getHistory, removeHistoryEntry, clearHistory, formatDate } from './history.js';
import { getPrefs, setPref } from './prefs.js';
import { getApiSettings, saveApiSettings, getCachedCategories, fetchCategories } from './categories.js';

const $ = id => document.getElementById(id);

function showMsg(text, cls = '') {
  $('msg').className = cls;
  $('msg').textContent = text;
}

async function renderStatus() {
  const config = await getConfig();
  const meta = await getConfigMeta();
  $('extVersion').textContent = extensionVersion();
  $('source').textContent = config._source === 'remota' ? 'Remota' : 'Incluida en la extensión';
  $('revision').textContent = `${config.revision ?? '?'} (${config.updatedAt || 'sin fecha'})`;
  $('checkedAt').textContent = meta?.checkedAt ? new Date(meta.checkedAt).toLocaleString() : 'Nunca';
  $('result').textContent = meta ? (meta.ok ? 'OK' : meta.error || '—') : '—';
  $('result').className = meta?.ok ? 'ok' : meta?.error ? 'err' : '';
}

async function renderHistory() {
  const entries = Object.entries(await getHistory()).sort(([, a], [, b]) => b.fecha.localeCompare(a.fecha));
  const cell = (content) => {
    const td = document.createElement('td');
    td.append(content);
    return td;
  };
  const rows = entries.map(([url, e]) => {
    const tr = document.createElement('tr');
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.textContent = e.titulo || url;
    const remove = document.createElement('button');
    remove.className = 'ghost';
    remove.textContent = 'Quitar';
    remove.addEventListener('click', async () => { await removeHistoryEntry(url); renderHistory(); });
    tr.append(cell(formatDate(e.fecha)), cell(e.categoria || 'Múltiples'), cell(String(e.productos)), cell(a), cell(remove));
    return tr;
  });
  $('historyBody').replaceChildren(...rows);
  $('historyTable').hidden = !rows.length;
  $('historyEmpty').hidden = !!rows.length;
  $('clearHistory').disabled = !rows.length;
}

function showApiMsg(text, cls = '') {
  $('apiMsg').className = `msg ${cls}`;
  $('apiMsg').textContent = text;
}

async function renderCategoriesStatus() {
  const cache = await getCachedCategories();
  if (cache.items.length) {
    const lines = [`${cache.items.length} categorías · actualizadas el ${formatDate(cache.fetchedAt)}`];
    if (cache.error) lines.push(`Último intento fallido: ${cache.error}`);
    showApiMsg(lines.join('\n'), cache.error ? 'err' : 'ok');
  } else {
    showApiMsg(cache.error || 'Sin categorías descargadas. Mientras tanto, la categoría se escribe a mano.', cache.error ? 'err' : '');
  }
}

async function loadCategories() {
  showApiMsg('Descargando categorías...');
  try {
    const cache = await fetchCategories();
    showApiMsg(`✓ ${cache.items.length} categorías descargadas.`, 'ok');
  } catch (e) {
    showApiMsg(e.message, 'err');
  }
}

async function saveApi() {
  const apiUrl = $('apiUrl').value.trim().replace(/\/+$/, '');
  const token = $('apiToken').value.trim();
  if (apiUrl) {
    let origin;
    try { origin = new URL(apiUrl).origin; } catch { return showApiMsg('La URL de la API no es válida.', 'err'); }
    // El token viaja en cada petición: solo por conexión cifrada.
    if (!apiUrl.startsWith('https://')) return showApiMsg('La URL debe empezar con https://', 'err');
    // Permiso para llamar a ese dominio desde la extensión (evita bloqueos CORS).
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) return showApiMsg('Sin permiso para acceder a ese dominio.', 'err');
  }
  await saveApiSettings({ apiUrl, token });
  if (apiUrl && token) await loadCategories();
  else showApiMsg('Guardado. Faltan la URL o el token para descargar las categorías.');
}

async function check() {
  showMsg('Comprobando...');
  const res = await refreshRemoteConfig();
  showMsg(res.ok ? `Configuración remota cargada (revisión ${res.config.revision ?? '?'}).` : `No se pudo cargar: ${res.error}`, res.ok ? 'ok' : 'err');
  renderStatus();
}

async function save() {
  const url = $('configUrl').value.trim();
  if (url) {
    let origin;
    try { origin = new URL(url).origin; } catch { return showMsg('La URL no es válida.', 'err'); }
    if (!url.startsWith('https://')) return showMsg('La URL debe usar https://', 'err');
    // Permiso para leer ese dominio aunque el servidor no envíe cabeceras CORS.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) return showMsg('Sin permiso para acceder a ese dominio.', 'err');
  }
  await saveSettings({ configUrl: url });
  if (url) await check();
  else showMsg('URL eliminada. Se usará la configuración incluida.', 'ok');
}

async function init() {
  $('version').textContent = extensionVersion();
  $('configUrl').value = (await getSettings()).configUrl;
  $('save').addEventListener('click', save);
  $('check').addEventListener('click', check);
  $('reset').addEventListener('click', async () => {
    await resetRemoteConfig();
    showMsg('Se eliminó la configuración remota en caché.', 'ok');
    renderStatus();
  });
  $('export').addEventListener('click', async () => {
    const { _source, ...config } = await getConfig();
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, 2));
    chrome.downloads.download({ url, filename: 'config.json' });
  });
  $('reload').addEventListener('click', () => chrome.runtime.reload());
  $('clearHistory').addEventListener('click', async () => {
    if (!confirm('¿Borrar todo el historial de páginas extraídas?')) return;
    await clearHistory();
    renderHistory();
  });
  const api = await getApiSettings();
  $('apiUrl').value = api.apiUrl;
  $('apiToken').value = api.token;
  $('saveApi').addEventListener('click', saveApi);
  $('refreshCategories').addEventListener('click', loadCategories);
  renderCategoriesStatus();

  const prefs = await getPrefs();
  for (const key of ['autoScroll', 'accumulate']) {
    $(key).checked = prefs[key];
    $(key).addEventListener('change', () => setPref(key, $(key).checked));
  }
  renderStatus();
  renderHistory();
}

init();
