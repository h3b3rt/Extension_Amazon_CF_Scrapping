import { getConfig, getConfigMeta, refreshRemoteConfig, compareVersions, extensionVersion } from './config.js';

const $ = id => document.getElementById(id);
const AMAZON_RE = /^https:\/\/([a-z0-9-]+\.)*amazon\.com\//i;
const STALE_MS = 30 * 60 * 1000;
const MAX_RECENT_CATEGORIES = 15;

function showStatus(message, type = '') {
  const status = $('status');
  status.hidden = false;
  status.className = type;
  status.textContent = message;
}

async function getState() {
  const { collected = {}, prefs = {} } = await chrome.storage.local.get(['collected', 'prefs']);
  return { collected, prefs: { autoScroll: false, accumulate: false, ...prefs } };
}

async function renderCollection() {
  const { collected, prefs } = await getState();
  const n = Object.keys(collected).length;
  $('count').textContent = n;
  $('collection').hidden = !(prefs.accumulate || n);
  $('download').disabled = !n;
  $('clear').disabled = !n;
}

// Aviso de nueva versión y mensajes publicados en la configuración remota.
// Se construye con textContent: el contenido remoto nunca se interpreta como HTML.
function renderBanner(config) {
  const banner = $('update');
  banner.replaceChildren();
  if (config.latestVersion && compareVersions(config.latestVersion, extensionVersion()) > 0) {
    const p = document.createElement('p');
    p.append(`Hay una nueva versión disponible: v${config.latestVersion}. `);
    if (/^https:\/\//i.test(config.downloadUrl || '')) {
      const a = document.createElement('a');
      a.href = config.downloadUrl;
      a.target = '_blank';
      a.textContent = 'Descargar';
      p.append(a);
    }
    banner.append(p);
  }
  if (config.notice) {
    const p = document.createElement('p');
    p.textContent = config.notice;
    banner.append(p);
  }
  banner.hidden = !banner.childElementCount;
}

function renderConfigInfo(config) {
  $('configInfo').textContent = `Config ${config._source} · rev ${config.revision ?? '?'}`;
}

function buildCsv(products, { headers, fields, defaults = {} }) {
  const esc = v => {
    const s = (v ?? '').toString();
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [headers.map(esc).join(',')];
  for (const p of products) rows.push(headers.map(h => esc(fields[h] ? p[fields[h]] : defaults[h])).join(','));
  return rows.join('\r\n');
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

async function downloadCsv(products, config) {
  const csv = buildCsv(products, config.csv);
  const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
  const prefix = config.csv.filenamePrefix || 'Plantilla_Scrapping';
  await chrome.downloads.download({ url, filename: `${prefix}_${timestamp()}.csv` });
}

// Pide la categoría antes de cada extracción. Propone la última usada y
// sugiere las recientes. (Más adelante se enlazará con las categorías del sistema.)
async function askCategory() {
  const { recentCategories = [], multiCategory = false } = await chrome.storage.local.get(['recentCategories', 'multiCategory']);
  $('multiCategory').checked = multiCategory;
  const datalist = $('recentCategories');
  datalist.replaceChildren(...recentCategories.map(c => Object.assign(document.createElement('option'), { value: c })));
  $('scrape').hidden = true;
  $('categoryForm').hidden = false;
  const input = $('category');
  input.value = recentCategories[0] || '';
  syncMultiCategory();
  if (!input.disabled) {
    input.focus();
    input.select();
  }
}

// "Múltiples categorías": la columna queda vacía para completarla a mano.
function syncMultiCategory() {
  const multi = $('multiCategory').checked;
  $('category').disabled = multi;
  $('category').required = !multi;
}

function hideCategoryForm() {
  $('categoryForm').hidden = true;
  $('scrape').hidden = false;
}

async function rememberCategory(categoria) {
  const { recentCategories = [] } = await chrome.storage.local.get('recentCategories');
  const next = [categoria, ...recentCategories.filter(c => c.toLowerCase() !== categoria.toLowerCase())];
  await chrome.storage.local.set({ recentCategories: next.slice(0, MAX_RECENT_CATEGORIES) });
}

async function scrape(categoria) {
  const button = $('scrape');
  button.disabled = true;
  if (categoria) await rememberCategory(categoria);
  const { collected, prefs } = await getState();
  showStatus(prefs.autoScroll ? 'Desplazando la página y analizando productos...' : 'Analizando productos de Amazon...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No se pudo identificar la pestaña.');
    if (!AMAZON_RE.test(tab.url || '')) throw new Error('Debes abrir una página de Amazon.com.');

    const config = await getConfig();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scraper.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cfg, opts) => globalThis.__amazonScraper(cfg, opts),
      args: [config, { autoScroll: prefs.autoScroll }],
    });
    const r = injection?.result;
    if (!r) throw new Error('El scraper no devolvió resultados.');
    if (r.error) throw new Error(r.error);

    const layoutsTxt = r.layouts.map(l => `${l.label}: ${l.extraidos} de ${l.encontrados}`).join('\n');
    if (!r.productos.length) throw new Error(`No se encontraron productos compatibles en esta página.\n\n${layoutsTxt}`);

    const lista = prefs.accumulate ? { ...collected } : {};
    let nuevos = 0;
    for (const p of r.productos) {
      if (!lista[p.asin]) nuevos++;
      lista[p.asin] = { ...p, categoria, codCategoria: '' };
    }
    await chrome.storage.local.set({ collected: lista });

    const sinImagen = r.productos.filter(p => !p.imagen).length;
    const sinPrecio = r.productos.filter(p => !p.precio).length;
    let msg = `✓ Extracción completada\n\nCategoría: ${categoria || 'múltiples (completar a mano)'}\nProductos en esta página: ${r.productos.length}\nSin imagen: ${sinImagen}\nSin precio: ${sinPrecio}\n\n${layoutsTxt}`;
    if (prefs.accumulate) {
      msg += `\n\nNuevos añadidos: ${nuevos}\nTotal en la lista: ${Object.keys(lista).length}`;
    } else {
      await downloadCsv(Object.values(lista), config);
      msg += '\n\nCSV descargado';
    }
    showStatus(msg, 'success');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Ocurrió un error.', 'error');
  } finally {
    button.disabled = false;
    renderCollection();
  }
}

async function init() {
  $('version').textContent = extensionVersion();
  const { prefs } = await getState();
  for (const key of ['autoScroll', 'accumulate']) {
    $(key).checked = prefs[key];
    $(key).addEventListener('change', async () => {
      const { prefs: current } = await getState();
      await chrome.storage.local.set({ prefs: { ...current, [key]: $(key).checked } });
      renderCollection();
    });
  }

  $('scrape').addEventListener('click', askCategory);
  $('categoryForm').addEventListener('submit', e => {
    e.preventDefault();
    const multi = $('multiCategory').checked;
    const categoria = multi ? '' : $('category').value.trim().replace(/\s+/g, ' ');
    if (!multi && !categoria) return $('category').focus();
    chrome.storage.local.set({ multiCategory: multi });
    hideCategoryForm();
    scrape(categoria);
  });
  $('multiCategory').addEventListener('change', () => {
    syncMultiCategory();
    if (!$('category').disabled) $('category').focus();
  });
  $('cancelCategory').addEventListener('click', hideCategoryForm);
  $('category').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); hideCategoryForm(); } });
  $('download').addEventListener('click', async () => {
    const { collected } = await getState();
    await downloadCsv(Object.values(collected), await getConfig());
    showStatus(`CSV descargado con ${Object.keys(collected).length} productos.`, 'success');
  });
  $('clear').addEventListener('click', async () => {
    await chrome.storage.local.set({ collected: {} });
    showStatus('Lista vaciada.');
    renderCollection();
  });
  $('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  const config = await getConfig();
  renderBanner(config);
  renderConfigInfo(config);
  renderCollection();

  // Si la última comprobación es antigua, refrescar en segundo plano.
  const meta = await getConfigMeta();
  if (!meta?.checkedAt || Date.now() - Date.parse(meta.checkedAt) > STALE_MS) {
    const res = await refreshRemoteConfig();
    if (res.ok) {
      const fresh = await getConfig();
      renderBanner(fresh);
      renderConfigInfo(fresh);
    }
  }
}

init();
