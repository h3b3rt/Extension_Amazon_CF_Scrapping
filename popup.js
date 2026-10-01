import { getConfig, getConfigMeta, refreshRemoteConfig, compareVersions, extensionVersion } from './config.js';
import { normalizeUrl, getHistory, saveHistoryEntry, formatDate } from './history.js';
import { getPrefs } from './prefs.js';
import { buildWorkbook } from './xlsx.js';
import {
  MAX_GROUP_NAME, cleanGroupName, nameTaken, defaultGroupName, newGroupId, syncGroups, sortedGroups, productsForExport,
} from './groups.js';
import {
  getCachedCategories, getCategories, refreshCategories, findCategory, searchCategories, categoryLabel, normalizeText,
  sourceLabel,
} from './categories.js';

const $ = id => document.getElementById(id);
const AMAZON_RE = /^https:\/\/([a-z0-9-]+\.)*amazon\.com\//i;
const STALE_MS = 30 * 60 * 1000;
const MAX_RECENT_CATEGORIES = 15;

// Extracción en preparación: pestaña, URL normalizada y si reemplaza datos previos.
let pending = null;
let defaultPrefix = 'Plantilla_Scraping';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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

// Lista actual y sus grupos. Los productos de versiones anteriores (sin grupo)
// reciben uno por página de origen la primera vez que se abre el popup.
async function getState() {
  const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
  if (syncGroups(collected, groups, await getHistory())) await chrome.storage.local.set({ collected, groups });
  return { collected, groups, prefs: await getPrefs() };
}

async function renderCollection() {
  const { collected, groups, prefs } = await getState();
  const n = Object.keys(collected).length;
  $('count').textContent = n;
  $('collection').hidden = !(prefs.accumulate || n);
  $('download').disabled = !n;
  $('clear').disabled = !n;
  renderSources(collected, groups);
}

// Grupos que forman la lista actual, en orden de extracción. Doble clic en el
// nombre para renombrarlo; "↗" abre la página original.
function renderSources(collected, groups) {
  const conteo = {};
  for (const p of Object.values(collected)) conteo[p.grupo] = (conteo[p.grupo] || 0) + 1;

  const items = sortedGroups(groups).map(g => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = g.nombre;
    name.title = [g.categoria ? `Categoría: ${g.categoria}` : 'Sin categoría', g.titulo, 'Doble clic para renombrar']
      .filter(Boolean).join('\n');
    name.addEventListener('dblclick', () => startRename(li, g.id));
    li.append(name);
    const info = document.createElement('span');
    info.className = 'meta';
    const n = conteo[g.id] || 0;
    info.textContent = ` · ${n} producto${n === 1 ? '' : 's'}`;
    li.append(info);
    if (/^https:\/\//i.test(g.origen || '')) {
      const a = document.createElement('a');
      a.href = g.origen;
      a.target = '_blank';
      a.className = 'open-page';
      a.title = 'Abrir la página original';
      a.textContent = '↗';
      li.append(' ', a);
    }
    return li;
  });
  $('sources').replaceChildren(...items);
  $('sources').hidden = !items.length;
}

// Renombrar en el mismo lugar: Enter o salir del campo guarda, Esc cancela.
// Un nombre vacío deja el anterior; uno repetido no se acepta.
async function startRename(li, id) {
  const { groups } = await getState();
  const actual = groups[id]?.nombre;
  if (actual === undefined) return;
  const input = Object.assign(document.createElement('input'), {
    className: 'text-input rename', value: actual, maxLength: MAX_GROUP_NAME,
  });
  input.setAttribute('aria-label', 'Nuevo nombre del grupo');
  const hint = Object.assign(document.createElement('div'), { className: 'hint error', hidden: true });
  li.replaceChildren(input, hint);
  input.focus();
  input.select();

  // `fromBlur`: al salir del campo con un nombre repetido se descarta el cambio.
  let busy = false;
  const finish = async (save, fromBlur = false) => {
    if (busy) return;
    busy = true;
    const nombre = cleanGroupName(input.value);
    if (save && nombre && nombre !== actual) {
      const { groups: fresh } = await getState();
      if (nameTaken(fresh, nombre, [id]) && !fromBlur) {
        hint.textContent = 'Ya existe un grupo con ese nombre.';
        hint.hidden = false;
        input.focus();
        busy = false;
        return;
      }
      if (fresh[id] && !nameTaken(fresh, nombre, [id])) {
        fresh[id].nombre = nombre;
        await chrome.storage.local.set({ groups: fresh });
      }
    }
    renderCollection();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true, true));
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

// Nombre final: <nombre elegido o prefijo por defecto>_<fecha>_<hora>.xlsx
function exportFileName(name) {
  return `${sanitizeFileName(name) || defaultPrefix}_${timestamp()}.xlsx`;
}

function bindFileNamePreview(inputId, previewId) {
  const update = () => { $(previewId).textContent = `Se guardará como: ${exportFileName($(inputId).value)}`; };
  $(inputId).addEventListener('input', update);
  return update;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Genera el xlsx desde plantilla.xlsx con las categorías actuales en Mapeo_categorias.
async function downloadXlsx(products, config, name = '') {
  const template = await (await fetch(chrome.runtime.getURL('plantilla.xlsx'))).arrayBuffer();
  const { bytes, summary } = await buildWorkbook(template, products, { config: config.xlsx, categories: catalogCache.items });
  if (!summary.filas) throw new Error('Ningún producto tiene SKU: no se generó el archivo.');
  const url = `data:${XLSX_MIME};base64,${toBase64(bytes)}`;
  const filename = exportFileName(name);
  await chrome.downloads.download({ url, filename });
  return { filename, ...summary };
}

// Resumen del archivo descargado (avisos solo si hay algo que revisar).
function exportSummary(r) {
  const lines = [`Excel descargado: ${r.filename}`, `Filas: ${r.filas}`];
  if (r.reacondicionados) lines.push(`Condición "Reacondicionado": ${r.reacondicionados} (revisar)`);
  if (r.sinCategoria) lines.push(`Sin categoría (elegir en la plantilla): ${r.sinCategoria}`);
  if (r.duplicados) lines.push(`Posibles variantes repetidas: ${r.duplicados} (ver ref_duplicado)`);
  if (r.omitidos) lines.push(`⚠ Omitidos sin SKU: ${r.omitidos}`);
  if (r.conGuion) lines.push(`⚠ SKU con guion: ${r.conGuion} (el sistema lo corta en el primer "-")`);
  return lines.join('\n');
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
    `Categoría: ${previous.categoria || 'sin llenar'}`,
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
  const { recentCategories = [] } = await chrome.storage.local.get('recentCategories');
  const previous = pending?.previous;
  // Siempre empieza desmarcada: "No llenar categoría" es la excepción, no la regla.
  $('multiCategory').checked = false;

  const catalog = catalogCache.items;
  combo.recent = recentCategories;
  $('category').placeholder = catalog.length ? 'Escribe para buscar: ollas, audífonos, CF0101…' : 'Ej: Audífonos inalámbricos';
  $('scrape').hidden = true;
  $('categoryForm').hidden = false;
  // En modo acumular el nombre se pide al descargar, no en cada extracción.
  const { groups, prefs } = await getState();
  $('fileNameGroup').hidden = prefs.accumulate;
  $('fileName').value = '';
  updateFileNamePreview();
  // Nombre del grupo: título de la página recortado, sin repetir uno de la lista.
  $('groupName').value = defaultGroupName(pending.title, ...groupsToCheck(groups, prefs));
  $('groupHint').textContent = 'Se verá en la columna ref_grupo del Excel.';
  $('groupHint').className = 'hint';
  const input = $('category');
  const sugerida = previous?.categoria || recentCategories[0] || '';
  combo.selected = catalog.length ? findCategory(catalog, sugerida) : null;
  input.value = catalog.length ? (combo.selected ? categoryLabel(combo.selected) : '') : sugerida;
  const { categoryMode: savedMode = 'search' } = await chrome.storage.local.get('categoryMode');
  syncMultiCategory();
  setCategoryMode(savedMode, { focus: false });
  focusCategoryField();
}

// ---- Dos formas de elegir: buscador o niveles (principal → secundaria → terciaria) ----

let categoryMode = 'search';

function setCategoryMode(mode, { focus = true } = {}) {
  const hasCatalog = catalogCache.items.length > 0;
  categoryMode = hasCatalog ? mode : 'search';
  $('modeBrowse').disabled = !hasCatalog;
  $('modeBrowse').title = hasCatalog ? '' : 'Disponible cuando haya categorías cargadas';
  for (const [id, m] of [['modeSearch', 'search'], ['modeBrowse', 'browse']]) {
    $(id).classList.toggle('active', m === categoryMode);
    $(id).setAttribute('aria-selected', String(m === categoryMode));
  }
  $('browseGroup').hidden = categoryMode !== 'browse';
  $('searchGroup').hidden = categoryMode !== 'search';
  setComboOpen(false);
  // Lo elegido en un modo se ve en el otro.
  if (categoryMode === 'browse') renderLevels(levelsOf(combo.selected));
  else if (combo.selected) $('category').value = categoryLabel(combo.selected);
  updateCategoryHint();
  if (focus) focusCategoryField();
}

// Enfoca el campo que toca completar: el buscador o el primer nivel sin elegir.
function focusCategoryField() {
  if ($('multiCategory').checked) return;
  if (categoryMode === 'browse') {
    const next = ['level1', 'level2', 'level3'].find(id => !$(id).value && !$(id).disabled) || 'level3';
    $(next).focus();
  } else {
    $('category').focus();
    $('category').select();
    renderComboList();
  }
}

const levelsOf = c => (c ? { primaria: c.primaria, secundaria: c.secundaria, codigo: c.codigo } : {});

function fillSelect(select, placeholder, options, value) {
  select.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: placeholder }),
    ...options.map(([v, t]) => Object.assign(document.createElement('option'), { value: v, textContent: t })),
  );
  select.value = options.some(([v]) => v === value) ? value : '';
}

// Cada lista muestra solo las opciones del nivel superior elegido.
function renderLevels({ primaria = '', secundaria = '', codigo = '' } = {}) {
  const catalog = catalogCache.items;
  const unique = values => [...new Set(values)];
  fillSelect($('level1'), 'Categoría principal…', unique(catalog.map(c => c.primaria)).map(p => [p, p]), primaria);
  const p = $('level1').value;
  const secundarias = unique(catalog.filter(c => c.primaria === p).map(c => c.secundaria));
  fillSelect($('level2'), p ? 'Categoría secundaria…' : 'Elige primero la principal', secundarias.map(s => [s, s]), secundaria);
  const s = $('level2').value;
  const terciarias = catalog.filter(c => c.primaria === p && c.secundaria === s);
  fillSelect($('level3'), s ? 'Categoría terciaria…' : 'Elige primero la secundaria', terciarias.map(c => [c.codigo, c.terciaria]), codigo);
  const multi = $('multiCategory').checked;
  $('level1').disabled = multi;
  $('level2').disabled = multi || !p;
  $('level3').disabled = multi || !s;
}

function onLevelChange(e) {
  renderLevels({ primaria: $('level1').value, secundaria: $('level2').value, codigo: $('level3').value });
  const codigo = $('level3').value;
  combo.selected = codigo ? catalogCache.items.find(c => c.codigo === codigo) || null : null;
  $('category').value = combo.selected ? categoryLabel(combo.selected) : '';
  updateCategoryHint();
  // Avanzar al siguiente nivel en cuanto se elige uno.
  const next = { level1: 'level2', level2: 'level3' }[e.target.id];
  if (next && e.target.value && !$(next).disabled) $(next).focus();
}

// Tras cargar o actualizar la lista: habilitar "Por niveles" y refrescar sus opciones.
function refreshCategoryUi() {
  if ($('categoryForm').hidden) return;
  setCategoryMode(categoryMode, { focus: false });
}

// ---- Buscador de categorías (lista desplegable que filtra mientras se escribe) ----

const combo = { selected: null, recent: [], items: [], active: -1 };

const comboLabel = item => (typeof item === 'string' ? item : categoryLabel(item));

// Qué mostrar: resultados de la búsqueda o, con el campo vacío, las recientes.
function comboEntries() {
  const catalog = catalogCache.items;
  const input = $('category');
  const typed = combo.selected && input.value === categoryLabel(combo.selected) ? '' : input.value.trim();
  if (catalog.length) {
    if (typed) return { query: typed, groups: [{ title: '', items: searchCategories(catalog, typed, 50) }] };
    const recientes = combo.recent.map(r => findCategory(catalog, r)).filter(Boolean);
    return {
      query: '',
      groups: recientes.length ? [{ title: 'Usadas recientemente', items: recientes }] : [],
      emptyText: recientes.length ? '' : `Escribe para buscar entre ${catalog.length} categorías.`,
    };
  }
  // Sin categorías del sistema: sugerir las escritas antes.
  const t = normalizeText(typed);
  const recientes = combo.recent.filter(r => !t || normalizeText(r).includes(t));
  return { query: typed, groups: recientes.length ? [{ title: 'Usadas recientemente', items: recientes }] : [] };
}

// Resalta (con <mark>) las partes del texto que coinciden, ignorando tildes.
function highlight(text, terms) {
  const frag = document.createDocumentFragment();
  if (!terms.length) { frag.append(text); return frag; }
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    for (const ch of text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) {
      norm += ch;
      map.push(i);
    }
  }
  const marked = new Array(text.length).fill(false);
  for (const t of terms) {
    for (let idx = norm.indexOf(t); idx !== -1; idx = norm.indexOf(t, idx + t.length)) {
      for (let k = idx; k < idx + t.length; k++) marked[map[k]] = true;
    }
  }
  let buf = '';
  let on = false;
  const flush = () => {
    if (!buf) return;
    if (on) frag.append(Object.assign(document.createElement('mark'), { textContent: buf }));
    else frag.append(buf);
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    if (marked[i] !== on) { flush(); on = marked[i]; }
    buf += text[i];
  }
  flush();
  return frag;
}

function comboOption(item, index, terms) {
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.id = `cat-opt-${index}`;
  const path = document.createElement('span');
  path.className = 'path';
  if (typeof item === 'string') {
    path.append(highlight(item, terms));
    li.append(path);
  } else {
    const ultimo = document.createElement('b');
    ultimo.append(highlight(item.terciaria, terms));
    path.append(highlight(`${item.primaria} / ${item.secundaria} / `, terms), ultimo);
    const code = document.createElement('span');
    code.className = 'code';
    code.append(highlight(item.codigo, terms));
    li.append(path, code);
  }
  // mousedown (no click) para elegir antes de que el campo pierda el foco.
  li.addEventListener('mousedown', e => { e.preventDefault(); chooseComboItem(index); });
  li.addEventListener('mousemove', () => { if (combo.active !== index) { combo.active = index; highlightActive(); } });
  return li;
}

function renderComboList() {
  const { query, groups, emptyText = '' } = comboEntries();
  combo.items = groups.flatMap(g => g.items);
  const terms = normalizeText(query).split(' ').filter(t => t && t !== '/');
  const nodes = [];
  let index = 0;
  for (const g of groups) {
    if (g.title) nodes.push(Object.assign(document.createElement('li'), { className: 'group', textContent: g.title }));
    for (const item of g.items) nodes.push(comboOption(item, index++, terms));
  }
  if (!combo.items.length && catalogCache.items.length) {
    const text = query ? 'Sin resultados. Prueba con otra palabra o con el código.' : emptyText;
    if (text) nodes.push(Object.assign(document.createElement('li'), { className: 'empty', textContent: text }));
  }
  $('categoryList').replaceChildren(...nodes);
  combo.active = query && combo.items.length ? 0 : -1;
  highlightActive();
  setComboOpen(nodes.length > 0);
}

function highlightActive() {
  const input = $('category');
  $('categoryList').querySelectorAll('[role=option]').forEach(li => {
    const on = li.id === `cat-opt-${combo.active}`;
    li.classList.toggle('active', on);
    li.setAttribute('aria-selected', String(on));
    if (on) li.scrollIntoView({ block: 'nearest' });
  });
  if (combo.active >= 0) input.setAttribute('aria-activedescendant', `cat-opt-${combo.active}`);
  else input.removeAttribute('aria-activedescendant');
}

function setComboOpen(open) {
  $('categoryList').hidden = !open;
  $('category').setAttribute('aria-expanded', String(open));
}

function chooseComboItem(index) {
  const item = combo.items[index];
  if (item === undefined) return;
  combo.selected = typeof item === 'string' ? null : item;
  $('category').value = comboLabel(item);
  setComboOpen(false);
  updateCategoryHint();
}

function onComboKeydown(e) {
  const open = !$('categoryList').hidden;
  const count = combo.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open) return renderComboList();
    if (!count) return;
    const step = e.key === 'ArrowDown' ? 1 : -1;
    combo.active = combo.active < 0 ? (step > 0 ? 0 : count - 1) : (combo.active + step + count) % count;
    highlightActive();
  } else if (e.key === 'Enter' && open && combo.active >= 0) {
    e.preventDefault();
    chooseComboItem(combo.active);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (open) setComboOpen(false);
    else hideCategoryForm();
  }
}

// Debajo del campo: código de la categoría elegida, o el estado de la lista.
// `message` (p. ej. un error de validación o el resultado de "Actualizar") tiene prioridad.
function updateCategoryHint(message = '', type = 'error') {
  const hint = $('categoryHint');
  const catalog = catalogCache.items;
  const multi = $('multiCategory').checked;
  let text = message;
  if (!text && !multi && catalog.length) {
    const c = combo.selected || findCategory(catalog, $('category').value);
    if (c) text = `Código: ${c.codigo}`;
  }
  if (!text && !multi && !catalog.length) text = 'Aún no hay categorías cargadas. Pulsa "↻ Actualizar".';
  hint.textContent = text;
  hint.className = `hint${message ? ` ${type}` : ''}`;
  hint.hidden = !text;
}

async function onRefreshCategories() {
  const btn = $('refreshCats');
  btn.disabled = true;
  btn.textContent = '↻ Actualizando…';
  catalogCache = await refreshCategories();
  btn.disabled = false;
  btn.textContent = '↻ Actualizar';
  // Si la categoría escrita existe en la lista nueva, queda elegida.
  combo.selected = findCategory(catalogCache.items, $('category').value) || null;
  refreshCategoryUi();
  if (catalogCache.error) {
    const respaldo = catalogCache.items.length ? ` Se sigue usando la lista anterior (${catalogCache.items.length} categorías).` : '';
    updateCategoryHint(`⚠ No se pudo actualizar.${respaldo}\n${catalogCache.error}`, 'error');
  } else {
    updateCategoryHint(`✓ ${catalogCache.items.length} categorías actualizadas (${sourceLabel(catalogCache.source)}).`, 'ok');
  }
  if (document.activeElement === $('category')) renderComboList();
}

// Categoría elegida en el formulario, con los 3 niveles y el código.
// null = "No llenar categoría" (columnas vacías para completar a mano).
function readCategory() {
  if ($('multiCategory').checked) return { ok: true, cat: null };
  const toCat = c => ({ principal: c.primaria, secundaria: c.secundaria, terciaria: c.terciaria, codigo: c.codigo, ruta: categoryLabel(c) });
  if (categoryMode === 'browse') {
    return combo.selected
      ? { ok: true, cat: toCat(combo.selected) }
      : { ok: false, error: 'Completa los tres niveles: principal, secundaria y terciaria.' };
  }
  const text = $('category').value.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'Escribe o elige una categoría.' };
  const catalog = catalogCache.items;
  if (!catalog.length) {
    return { ok: true, cat: { principal: text, secundaria: '', terciaria: '', codigo: '', ruta: text } };
  }
  const c = combo.selected || findCategory(catalog, text);
  if (!c) return { ok: false, error: 'Elige una categoría de la lista.' };
  return { ok: true, cat: toCat(c) };
}

// "No llenar categoría": las columnas quedan vacías para completarlas a mano.
function syncMultiCategory() {
  const multi = $('multiCategory').checked;
  $('category').disabled = multi;
  if (categoryMode === 'browse') renderLevels(levelsOf(combo.selected));
}

// Grupos contra los que no se puede repetir el nombre: ninguno si cada extracción
// empieza una lista nueva; al reemplazar, sin los de esta página (se borran).
function groupsToCheck(groups, prefs) {
  if (!prefs.accumulate) return [{}, []];
  const reemplazados = pending?.replace ? Object.keys(groups).filter(id => groups[id].origen === pending.url) : [];
  return [groups, reemplazados];
}

// Nombre del grupo del formulario; vacío = el propuesto por defecto.
async function readGroupName() {
  const { groups, prefs } = await getState();
  const [existentes, excepto] = groupsToCheck(groups, prefs);
  const nombre = cleanGroupName($('groupName').value) || defaultGroupName(pending.title, existentes, excepto);
  if (nameTaken(existentes, nombre, excepto)) return { ok: false, error: 'Ya existe un grupo con ese nombre en la lista.' };
  return { ok: true, nombre };
}

function hideCategoryForm() {
  $('categoryForm').hidden = true;
  $('scrape').hidden = false;
}

async function rememberCategory(categoria) {
  const { recentCategories = [] } = await chrome.storage.local.get('recentCategories');
  const key = normalizeText(categoria);
  const next = [categoria, ...recentCategories.filter(c => normalizeText(c) !== key)];
  await chrome.storage.local.set({ recentCategories: next.slice(0, MAX_RECENT_CATEGORIES) });
}

async function scrape(cat, nombreGrupo) {
  const { tabId, url, title, replace } = pending;
  const button = $('scrape');
  button.disabled = true;
  if (cat) await rememberCategory(cat.ruta);
  const { collected, groups, prefs } = await getState();
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
    const grupos = prefs.accumulate ? { ...groups } : {};
    let eliminados = 0;
    if (replace) {
      // Reemplazar = empezar de cero: se borran los productos y el grupo de esta página.
      for (const [asin, p] of Object.entries(lista)) {
        if (p.origen === url) { delete lista[asin]; eliminados++; }
      }
      for (const [id, g] of Object.entries(grupos)) if (g.origen === url) delete grupos[id];
    }
    const grupo = newGroupId();
    grupos[grupo] = { nombre: nombreGrupo, origen: url, fecha: new Date().toISOString(), titulo: title, categoria: cat?.ruta || '' };
    let nuevos = 0;
    let movidos = 0;
    for (const p of r.productos) {
      // Mismo SKU en otro grupo: gana esta extracción (datos y grupo) y no se repite.
      if (lista[p.asin]) movidos++;
      else nuevos++;
      delete lista[p.asin];
      lista[p.asin] = {
        ...p,
        categoria: cat?.principal || '',
        categoriaSecundaria: cat?.secundaria || '',
        categoriaTerciaria: cat?.terciaria || '',
        codCategoria: cat?.codigo || '',
        categoriaRuta: cat?.ruta || '',
        origen: url,
        grupo,
      };
    }
    syncGroups(lista, grupos);
    await chrome.storage.local.set({ collected: lista, groups: grupos });
    await saveHistoryEntry(url, {
      fecha: new Date().toISOString(),
      categoria: cat?.ruta || '',
      codigo: cat?.codigo || '',
      productos: r.productos.length,
      titulo: title,
    });

    const sinImagen = r.productos.filter(p => !p.imagen).length;
    const sinPrecio = r.productos.filter(p => !p.precio).length;
    const catTxt = cat ? `${cat.ruta}${cat.codigo ? ` (${cat.codigo})` : ''}` : 'sin llenar (elegir en la plantilla)';
    const marcaTxt = r.marcaPagina ? `Marca de la tienda (solo referencia): ${r.marcaPagina}\n` : '';
    const tipoTxt = r.tipoPagina ? `Tipo de página: ${r.tipoPagina.label}\n` : '';
    let msg = `✓ ${replace ? 'Datos anteriores reemplazados' : 'Extracción completada'}\n\nGrupo: ${nombreGrupo}\nCategoría: ${catTxt}\n${tipoTxt}${marcaTxt}Productos en esta página: ${r.productos.length}\nSin imagen: ${sinImagen}\nSin precio: ${sinPrecio}\n\n${layoutsTxt}`;
    if (prefs.accumulate) {
      if (replace) msg += `\n\nEliminados de la extracción anterior: ${eliminados}`;
      msg += `\n${replace ? '' : '\n'}Nuevos añadidos: ${nuevos}`;
      if (movidos) msg += `\nYa estaban en otro grupo (pasan a este): ${movidos}`;
      msg += `\nTotal en la lista: ${Object.keys(lista).length}`;
    } else {
      msg += `\n\n${exportSummary(await downloadXlsx(productsForExport(lista, grupos), config, pending.fileName))}`;
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
  $('categoryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const choice = readCategory();
    if (!choice.ok) {
      updateCategoryHint(choice.error);
      return focusCategoryField();
    }
    const group = await readGroupName();
    if (!group.ok) {
      $('groupHint').textContent = group.error;
      $('groupHint').className = 'hint error';
      $('groupName').focus();
      return $('groupName').select();
    }
    pending.fileName = $('fileName').value;
    hideCategoryForm();
    scrape(choice.cat, group.nombre);
  });
  $('groupName').addEventListener('input', () => {
    $('groupHint').textContent = 'Se verá en la columna ref_grupo del Excel.';
    $('groupHint').className = 'hint';
  });
  for (const [id, mode] of [['modeSearch', 'search'], ['modeBrowse', 'browse']]) {
    $(id).addEventListener('click', () => {
      setCategoryMode(mode);
      chrome.storage.local.set({ categoryMode: mode });
    });
  }
  for (const id of ['level1', 'level2', 'level3']) $(id).addEventListener('change', onLevelChange);
  $('browseGroup').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); hideCategoryForm(); }
  });
  $('multiCategory').addEventListener('change', () => {
    syncMultiCategory();
    updateCategoryHint();
    focusCategoryField();
  });
  $('category').addEventListener('input', () => {
    combo.selected = null;
    renderComboList();
    updateCategoryHint();
  });
  $('cancelCategory').addEventListener('click', hideCategoryForm);
  $('refreshCats').addEventListener('click', onRefreshCategories);
  $('category').addEventListener('keydown', onComboKeydown);
  $('category').addEventListener('focus', renderComboList);
  $('category').addEventListener('blur', () => setComboOpen(false));
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
    const { collected, groups } = await getState();
    try {
      const r = await downloadXlsx(productsForExport(collected, groups), await getConfig(), $('exportName').value);
      hideExportForm();
      showStatus(exportSummary(r), 'success');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'No se pudo generar el Excel.', 'error');
    }
  });
  $('cancelExport').addEventListener('click', hideExportForm);
  $('exportName').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); hideExportForm(); } });
  $('clear').addEventListener('click', async () => {
    await chrome.storage.local.set({ collected: {}, groups: {} });
    showStatus('Lista vaciada.');
    renderCollection();
  });
  $('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  const config = await getConfig();
  defaultPrefix = config.xlsx?.filenamePrefix || defaultPrefix;
  renderBanner(config);
  renderConfigInfo(config);
  renderCollection();

  // Categorías: primero la caché (instantáneo) y luego se refresca si está vencida.
  catalogCache = await getCachedCategories();
  getCategories().then(fresh => {
    catalogCache = fresh;
    refreshCategoryUi();
    if (document.activeElement === $('category')) renderComboList();
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
