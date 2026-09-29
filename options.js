import {
  getConfig, getConfigMeta, getSettings, saveSettings, refreshRemoteConfig, resetRemoteConfig, extensionVersion,
} from './config.js';

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
  renderStatus();
}

init();
