import { getConfig, getConfigMeta, refreshRemoteConfig, compareVersions, extensionVersion } from './config.js';
import { normalizeUrl, getHistory, saveHistoryEntry, formatDate } from './history.js';
import { getPrefs } from './prefs.js';
import { getCachedCategories, getCategories, findCategory } from './categories.js';

const $ = id => document.getElementById(id);
const AMAZON_RE = /^https:\/\/([a-z0-9-]+\.)*amazon\.com\//i;
const STALE_MS = 30 * 60 * 1000;
const MAX_RECENT_CATEGORIES = 15;

// Extracción en preparación: pestaña, URL normalizada y si reemplaza datos previos.
let pending = null;
let defaultPrefix = 'Plantilla_Scrapping';
let updateFileNamePreview = () => {};
let updateExportNamePreview = () => {};
// Categorías del sistema (en caché; vacía si la API no está configurada).
let catalogCache = { items: [], fetchedAt: null, error: null };

function showStatus(message, type = '') {
  const status = $('status');
  status.hidden = false;
  status.className = type;
  status.textContent = message;
}

async function getState() {
  const { collected = {} } = await chrome.storage.local.get('collected');
  return { collected, prefs: await getPrefs() };
}

async function renderCollection() {
  const { collected, prefs } = await getState();
  const n = Object.keys(collected).length;
  $('count').textContent = n;
  $('collection').hidden = !(prefs.accumulate || n);
  $('download').disabled = !n;
  $('clear').disabled = !n;
  await renderSources(collected);
}

// Páginas que forman la lista actual, en orden de extracción, con su categoría
// ("Multicategoría N" si se dejó vacía) y un enlace a la página original.
async function renderSources(collected) {
  const history = await getHistory();
  const groups = new Map();
  for (const p of Object.values(collected)) {
    const key = p.origen || '';
    const g = groups.get(key) || {
      url: key,
      categoria: p.categoriaTerciaria || p.categoria || '',
      ruta: p.categoriaRuta || '',
      productos: 0,
    };
    g.productos++;
    groups.set(key, g);
  }
  const fechaDe = g => history[g.url]?.fecha || '';
  const sorted = [...groups.values()].sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));

  let multi = 0;
  const items = sorted.map(g => {
    const li = document.createElement('li');
    const nombre = g.url ? (g.categoria || `Multicategoría ${++multi}`) : 'Extracciones anteriores';
    const titulo = history[g.url]?.titulo || g.url;
    if (g.url) {
      const a = document.createElement('a');
      a.href = g.url;
      a.target = '_blank';
      a.title = g.ruta ? `${g.ruta}\n${titulo}` : titulo;
      a.textContent = nombre;
      li.append(a);
    } else {
      li.append(nombre);
    }
    const info = document.createElement('span');
    info.className = 'meta';
    info.textContent = ` · ${g.productos} producto${g.productos === 1 ? '' : 's'}`;
    li.append(info);
    return li;
  });
  $('sources').replaceChildren(...items);
  $('sources').hidden = !items.length;
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

// "Audífonos HyperX" -> "Audífonos_HyperX". Quita caracteres no válidos en Windows.
function sanitizeFileName(name) {
  return (name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
}

// Nombre final: <nombre elegido o prefijo por defecto>_<fecha>_<hora>.csv
function csvFileName(name) {
  return `${sanitizeFileName(name) || defaultPrefix}_${timestamp()}.csv`;
}

function bindFileNamePreview(inputId, previewId) {
  const update = () => { $(previewId).textContent = `Se guardará como: ${csvFileName($(inputId).value)}`; };
  $(inputId).addEventListener('input', update);
  return update;
}

async function downloadCsv(products, config, name = '') {
  const csv = buildCsv(products, config.csv);
  const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
  const filename = csvFileName(name);
  await chrome.downloads.download({ url, filename });
  return filename;
}

// Primer paso al pulsar "Extraer": valida la pestaña y consulta el historial.
async function startExtraction() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No se pudo identificar la pestaña.');
    if (!AMAZON_RE.test(tab.url || '')) throw new Error('Debes abrir una página de Amazon.com.');
    const url = normalizeUrl(tab.url, await getConfig());
    pending = { tabId: tab.id, url, title: tab.title || '', replace: false };

    const previous = (await getHistory())[url];
    if (previous) return showDuplicate(previous);
    askCategory();
  } catch (error) {
    showStatus(error.message || 'Ocurrió un error.', 'error');
  }
}

async function showDuplicate(previous) {
  const { collected } = await getState();
  const enLista = Object.values(collected).filter(p => p.origen === pending.url).length;
  $('duplicateInfo').textContent = [
    `Fecha: ${formatDate(previous.fecha)}`,
    `Productos: ${previous.productos}`,
    `Categoría: ${previous.categoria || 'múltiples'}`,
    enLista ? `En la lista actual: ${enLista} productos de esta página` : 'Sus productos ya no están en la lista actual.',
  ].join('\n');
  $('scrape').hidden = true;
  $('duplicatePanel').hidden = false;
  pending.previous = previous;
  $('replaceData').focus();
}

function hideDuplicate() {
  $('duplicatePanel').hidden = true;
  $('scrape').hidden = false;
}

// Pide la categoría antes de cada extracción. Con la API configurada se elige
// de la lista del sistema (buscando por cualquier parte de la ruta o por código);
// sin API se escribe a mano. Propone la última usada o la de la extracción
// anterior de esta página.
async function askCategory() {
  const { recentCategories = [], multiCategory = false } = await chrome.storage.local.get(['recentCategories', 'multiCategory']);
  const previous = pending?.previous;
  $('multiCategory').checked = previous ? !previous.categoria : multiCategory;

  const catalog = catalogCache.items;
  const option = (value, label) => Object.assign(document.createElement('option'), { value, label: label || '' });
  let options;
  if (catalog.length) {
    const recientes = recentCategories.map(r => findCategory(catalog, r)).filter(Boolean);
    const resto = catalog.filter(c => !recientes.includes(c));
    options = [...recientes, ...resto].map(c => option(c.ruta, c.codigo));
  } else {
    options = recentCategories.map(c => option(c));
  }
  $('recentCategories').replaceChildren(...options);
  $('category').placeholder = catalog.length ? 'Busca: ollas, audífonos, CF010101…' : 'Ej: Audífonos inalámbricos';
  $('scrape').hidden = true;
  $('categoryForm').hidden = false;
  // En modo acumular el nombre se pide al descargar, no en cada extracción.
  const { prefs } = await getState();
  $('fileNameGroup').hidden = prefs.accumulate;
  $('fileName').value = '';
  updateFileNamePreview();
  const input = $('category');
  const sugerida = previous?.categoria || recentCategories[0] || '';
  input.value = !catalog.length || findCategory(catalog, sugerida) ? sugerida : '';
  syncMultiCategory();
  updateCategoryHint();
  if (!input.disabled) {
    input.focus();
    input.select();
  }
}

// Debajo del campo: código de la categoría elegida, o el estado de la lista.
function updateCategoryHint(errorText = '') {
  const hint = $('categoryHint');
  const catalog = catalogCache.items;
  let text = errorText;
  if (!text && !$('multiCategory').checked && catalog.length) {
    const c = findCategory(catalog, $('category').value);
    text = c ? `Código: ${c.codigo}` : `Elige una de las ${catalog.length} categorías del sistema.`;
  }
  if (!text && catalogCache.error) text = `⚠ ${catalogCache.error}`;
  if (catalogCache.error && catalog.length && !errorText) {
    text += `\n⚠ No se pudo actualizar la lista (${catalogCache.error}). Se usa la del ${formatDate(catalogCache.fetchedAt)}.`;
  }
  hint.textContent = text;
  hint.className = `hint${errorText ? ' error' : ''}`;
  hint.hidden = !text;
}

// Categoría elegida en el formulario, con los 3 niveles y el código.
// null = múltiples categorías (columnas vacías para completar a mano).
function readCategory() {
  if ($('multiCategory').checked) return { ok: true, cat: null };
  const text = $('category').value.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'Escribe o elige una categoría.' };
  const catalog = catalogCache.items;
  if (!catalog.length) {
    return { ok: true, cat: { principal: text, secundaria: '', terciaria: '', codigo: '', ruta: text } };
  }
  const c = findCategory(catalog, text);
  if (!c) return { ok: false, error: 'Esa categoría no existe en el sistema. Elígela de la lista.' };
  return { ok: true, cat: { principal: c.primaria, secundaria: c.secundaria, terciaria: c.terciaria, codigo: c.codigo, ruta: c.ruta } };
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

async function scrape(cat) {
  const { tabId, url, title, replace } = pending;
  const button = $('scrape');
  button.disabled = true;
  if (cat) await rememberCategory(cat.ruta);
  const { collected, prefs } = await getState();
  showStatus(prefs.autoScroll ? 'Desplazando la página y analizando productos...' : 'Analizando productos de Amazon...');
  try {
    const config = await getConfig();
    await chrome.scripting.executeScript({ target: { tabId }, files: ['scraper.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (cfg, opts) => globalThis.__amazonScraper(cfg, opts),
      args: [config, { autoScroll: prefs.autoScroll }],
    });
    const r = injection?.result;
    if (!r) throw new Error('El scraper no devolvió resultados.');
    if (r.error) throw new Error(r.error);

    const layoutsTxt = r.layouts.map(l => `${l.label}: ${l.extraidos} de ${l.encontrados}`).join('\n');
    if (!r.productos.length) throw new Error(`No se encontraron productos compatibles en esta página.\n\n${layoutsTxt}`);

    const lista = prefs.accumulate ? { ...collected } : {};
    let eliminados = 0;
    if (replace) {
      for (const [asin, p] of Object.entries(lista)) {
        if (p.origen === url) { delete lista[asin]; eliminados++; }
      }
    }
    let nuevos = 0;
    for (const p of r.productos) {
      if (!lista[p.asin]) nuevos++;
      lista[p.asin] = {
        ...p,
        categoria: cat?.principal || '',
        categoriaSecundaria: cat?.secundaria || '',
        categoriaTerciaria: cat?.terciaria || '',
        codCategoria: cat?.codigo || '',
        categoriaRuta: cat?.ruta || '',
        origen: url,
      };
    }
    await chrome.storage.local.set({ collected: lista });
    await saveHistoryEntry(url, {
      fecha: new Date().toISOString(),
      categoria: cat?.ruta || '',
      codigo: cat?.codigo || '',
      productos: r.productos.length,
      titulo: title,
    });

    const sinImagen = r.productos.filter(p => !p.imagen).length;
    const sinPrecio = r.productos.filter(p => !p.precio).length;
    const catTxt = cat ? `${cat.ruta}${cat.codigo ? ` (${cat.codigo})` : ''}` : 'múltiples (completar a mano)';
    let msg = `✓ ${replace ? 'Datos anteriores reemplazados' : 'Extracción completada'}\n\nCategoría: ${catTxt}\nProductos en esta página: ${r.productos.length}\nSin imagen: ${sinImagen}\nSin precio: ${sinPrecio}\n\n${layoutsTxt}`;
    if (prefs.accumulate) {
      if (replace) msg += `\n\nEliminados de la extracción anterior: ${eliminados}`;
      msg += `\n${replace ? '' : '\n'}Nuevos añadidos: ${nuevos}\nTotal en la lista: ${Object.keys(lista).length}`;
    } else {
      const filename = await downloadCsv(Object.values(lista), config, pending.fileName);
      msg += `\n\nCSV descargado: ${filename}`;
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

  $('scrape').addEventListener('click', startExtraction);
  $('replaceData').addEventListener('click', () => {
    pending.replace = true;
    hideDuplicate();
    askCategory();
  });
  $('cancelDuplicate').addEventListener('click', () => {
    pending = null;
    hideDuplicate();
  });
  $('categoryForm').addEventListener('submit', e => {
    e.preventDefault();
    const choice = readCategory();
    if (!choice.ok) {
      updateCategoryHint(choice.error);
      return $('category').focus();
    }
    chrome.storage.local.set({ multiCategory: $('multiCategory').checked });
    pending.fileName = $('fileName').value;
    hideCategoryForm();
    scrape(choice.cat);
  });
  $('multiCategory').addEventListener('change', () => {
    syncMultiCategory();
    updateCategoryHint();
    if (!$('category').disabled) $('category').focus();
  });
  $('category').addEventListener('input', () => updateCategoryHint());
  $('cancelCategory').addEventListener('click', hideCategoryForm);
  $('category').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); hideCategoryForm(); } });
  updateFileNamePreview = bindFileNamePreview('fileName', 'fileNamePreview');
  updateExportNamePreview = bindFileNamePreview('exportName', 'exportNamePreview');
  const hideExportForm = () => { $('exportForm').hidden = true; $('download').parentElement.hidden = false; };
  $('download').addEventListener('click', () => {
    $('download').parentElement.hidden = true;
    $('exportForm').hidden = false;
    $('exportName').value = '';
    updateExportNamePreview();
    $('exportName').focus();
  });
  $('exportForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { collected } = await getState();
    const filename = await downloadCsv(Object.values(collected), await getConfig(), $('exportName').value);
    hideExportForm();
    showStatus(`CSV descargado con ${Object.keys(collected).length} productos:\n${filename}`, 'success');
  });
  $('cancelExport').addEventListener('click', hideExportForm);
  $('exportName').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); hideExportForm(); } });
  $('clear').addEventListener('click', async () => {
    await chrome.storage.local.set({ collected: {} });
    showStatus('Lista vaciada.');
    renderCollection();
  });
  $('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  const config = await getConfig();
  defaultPrefix = config.csv.filenamePrefix || defaultPrefix;
  renderBanner(config);
  renderConfigInfo(config);
  renderCollection();

  // Categorías: primero la caché (instantáneo) y luego se refresca si está vencida.
  catalogCache = await getCachedCategories();
  getCategories().then(fresh => {
    catalogCache = fresh;
    if (!$('categoryForm').hidden) updateCategoryHint();
  });

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
