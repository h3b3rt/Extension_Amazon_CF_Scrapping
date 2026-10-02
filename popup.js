import { getConfig, getConfigMeta, refreshRemoteConfig, compareVersions, extensionVersion } from './config.js';
import { normalizeUrl, getHistory, removeHistoryEntry, formatDate } from './history.js';
import { getPrefs } from './prefs.js';
import { downloadXlsx, exportSummary, exportFileName, DEFAULT_PREFIX } from './export.js';
import { getJobs, jobForUrl } from './jobs.js';
import {
  MAX_GROUP_NAME, cleanGroupName, nameTaken, defaultGroupName, syncGroups, sortedGroups, productsForExport,
} from './groups.js';
import {
  getCachedCategories, getCategories, refreshCategories, findCategory, searchCategories, categoryLabel, normalizeText,
  sourceLabel,
} from './categories.js';
import {
  appName, sitesOf, findSite, siteConfig, siteTitle, productKey, pageLabel, pageTypeByUrl, regionRedirect,
} from './sites.js';

const $ = id => document.getElementById(id);
const STALE_MS = 30 * 60 * 1000;
const MAX_RECENT_CATEGORIES = 15;
const DEFAULT_LOAD_LIMIT = 50;
const MAX_LOAD_LIMIT = 500;
const DEFAULT_PAGES = 1;
const MAX_PAGES = 10;

// Extracción en preparación: pestaña, sitio y su configuración, URL normalizada
// y si reemplaza datos previos.
let pending = null;
let defaultPrefix = DEFAULT_PREFIX;
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

// Grupos que forman la lista actual, en orden de extracción. "▸" despliega el
// resumen de su extracción; doble clic en el nombre para renombrarlo; "↗" abre la
// página original; "🗑" elimina el grupo y sus productos.
const abiertos = new Set();
function renderSources(collected, groups) {
  const conteo = {};
  for (const p of Object.values(collected)) conteo[p.grupo] = (conteo[p.grupo] || 0) + 1;

  const items = sortedGroups(groups).map(g => {
    const li = document.createElement('li');
    const n = conteo[g.id] || 0;
    const toggle = Object.assign(document.createElement('button'), {
      type: 'button', className: 'group-toggle', textContent: abiertos.has(g.id) ? '▾' : '▸', title: 'Ver el resumen de la extracción',
    });
    toggle.setAttribute('aria-expanded', String(abiertos.has(g.id)));
    toggle.addEventListener('click', () => {
      if (abiertos.has(g.id)) abiertos.delete(g.id);
      else abiertos.add(g.id);
      renderSources(collected, groups);
    });
    li.append(toggle);
    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = g.nombre;
    name.title = [g.categoria ? `Categoría: ${g.categoria}` : 'Sin categoría', g.titulo, 'Doble clic para renombrar']
      .filter(Boolean).join('\n');
    name.addEventListener('dblclick', () => startRename(li, g.id));
    li.append(name);
    const info = document.createElement('span');
    info.className = 'meta';
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
    const borrar = Object.assign(document.createElement('button'), {
      type: 'button', className: 'group-delete', textContent: '🗑', title: 'Eliminar este grupo y sus productos',
    });
    borrar.addEventListener('click', () => confirmDelete(li, g, n));
    li.append(borrar);
    if (abiertos.has(g.id)) {
      const det = document.createElement('div');
      det.className = 'group-details';
      const fecha = g.fecha ? `Extraído: ${formatDate(g.fecha)}` : '';
      det.textContent = [...(g.resumen || ['Sin resumen (extraído con una versión anterior).']), fecha].filter(Boolean).join('\n');
      li.append(det);
    }
    return li;
  });
  $('sources').replaceChildren(...items);
  $('sources').hidden = !items.length;
}

// Eliminar un grupo: pide confirmación en el mismo lugar. Quita sus productos y su
// página del historial (para poder extraerla de nuevo sin aviso).
function confirmDelete(li, g, n) {
  const p = Object.assign(document.createElement('span'), { className: 'confirm-text', textContent: `¿Eliminar «${g.nombre}» y sus ${n} producto${n === 1 ? '' : 's'}? ` });
  const si = Object.assign(document.createElement('button'), { type: 'button', className: 'mini danger', textContent: 'Eliminar' });
  const no = Object.assign(document.createElement('button'), { type: 'button', className: 'mini', textContent: 'Cancelar' });
  no.addEventListener('click', renderCollection);
  si.addEventListener('click', async () => {
    const { collected, groups } = await getState();
    for (const [key, prod] of Object.entries(collected)) if (prod.grupo === g.id) delete collected[key];
    const origen = groups[g.id]?.origen;
    delete groups[g.id];
    abiertos.delete(g.id);
    await chrome.storage.local.set({ collected, groups });
    // Si otro grupo viene de la misma página, el historial se conserva.
    if (origen && !Object.values(groups).some(x => x.origen === origen)) await removeHistoryEntry(origen);
    showStatus(`Grupo «${g.nombre}» eliminado (${n} producto${n === 1 ? '' : 's'}).`);
    renderCollection();
  });
  li.replaceChildren(p, si, ' ', no);
  si.focus();
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

function bindFileNamePreview(inputId, previewId) {
  const update = () => { $(previewId).textContent = `Se guardará como: ${exportFileName($(inputId).value, defaultPrefix)}`; };
  $(inputId).addEventListener('input', update);
  return update;
}

// Título del popup según el sitio de la pestaña; fuera de los sitios disponibles,
// el nombre general y la lista de sitios con su enlace.
async function renderSite(config) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Otra región del sitio: no se extrae; se ofrece abrir la página en EE. UU.
  const region = regionRedirect(config, tab?.url || '', tab?.title || '');
  const site = region ? null : findSite(config, tab?.url || '');
  $('appTitle').textContent = site ? siteTitle(site) : region ? siteTitle(region.site) : appName(config);
  $('regionPanel').hidden = !region;
  $('sitesPanel').hidden = !!site || !!region;
  $('scrape').hidden = !site;
  $('regionOpen').hidden = false;
  if (region) {
    $('regionTitle').textContent = `Esta página es de otra región de ${region.site.name}.`;
    $('regionText').textContent = region.query
      ? `La extensión solo trabaja con la versión de EE. UU. Se buscará allí: "${region.query}".`
      : region.portada
        ? 'La extensión solo trabaja con la versión de EE. UU. Se abrirá su página principal.'
        : 'La extensión solo trabaja con la versión de EE. UU. Se abrirá la misma página allí.';
    $('regionOpen').textContent = `Abrir en ${new URL(region.site.homeUrl).hostname}`;
    $('regionOpen').onclick = async () => {
      await chrome.tabs.update(tab.id, { url: region.target });
      window.close();
    };
  }
  // Búsqueda abierta en un panel sobre otra página (Marc Jacobs): la URL sigue siendo
  // la de esa página y el panel no se puede paginar. Se ofrece abrirla como página.
  const S = site?.searchOverlay;
  const q = S && tab?.id && enRutaPropia(siteConfig(config, site), tab.url) ? await busquedaEnPanel(tab.id, S) : null;
  if (q != null) {
    $('scrape').hidden = true;
    $('regionPanel').hidden = false;
    $('regionTitle').textContent = 'La búsqueda está abierta en un panel.';
    $('regionText').textContent = q
      ? `Para extraer todos los resultados, ábrela como página: "${q}".`
      : 'Cierra el panel y abre la búsqueda como página (Enter o "View all") para extraer.';
    $('regionOpen').hidden = !q || !S.url;
    $('regionOpen').textContent = 'Abrir resultados como página';
    $('regionOpen').onclick = async () => {
      await chrome.tabs.update(tab.id, { url: S.url.replace('{q}', encodeURIComponent(q)) });
      window.close();
    };
  }
  const items = sitesOf(config).map(s => {
    const li = document.createElement('li');
    if (/^https:\/\//i.test(s.homeUrl || '')) {
      const a = Object.assign(document.createElement('a'), { href: s.homeUrl, target: '_blank', textContent: s.name });
      li.append(a);
    } else {
      li.textContent = s.name;
    }
    return li;
  });
  $('sitesList').replaceChildren(...items);
}

// ¿La página es un listado con páginas siguientes? (Amazon: /s; no las portadas
// de categoría /b ni las tiendas de marca, que se extraen enteras).
function listadoConPaginas(cfg, url) {
  const p = cfg.loadMore?.urlPattern;
  if (!p) return true;
  try { return new RegExp(p, 'i').test(new URL(url).pathname); } catch { return true; }
}

// Término de la búsqueda abierta en el panel (searchOverlay), '' si está abierta sin
// término legible, o null si no hay panel abierto (o no se pudo leer la pestaña).
async function busquedaEnPanel(tabId, S) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, campos) => {
        try { if (!document.querySelector(sel)) return null; } catch { return null; }
        for (const c of campos) {
          let el = null;
          try { el = document.querySelector(c); } catch { /* selector remoto inválido */ }
          const v = String((el?.matches('input') ? el.value : el?.textContent) || '').replace(/\s+/g, ' ').trim();
          if (v) return v;
        }
        return '';
      },
      args: [S.selector, Array.isArray(S.query) ? S.query : []],
    });
    return typeof r?.result === 'string' ? r.result : null;
  } catch { return null; }
}

// ¿La página es de la tienda que se extrae (onlyPath; Marc Jacobs: /us-en/)? Sin
// redirección: las otras regiones solo muestran el aviso.
function enRutaPropia(cfg, url) {
  if (!cfg.onlyPath?.pattern) return true;
  try { return new RegExp(cfg.onlyPath.pattern, 'i').test(new URL(url).pathname); } catch { return true; }
}

// Primer paso al pulsar "Extraer": valida la pestaña y consulta el historial.
async function startExtraction() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No se pudo identificar la pestaña.');
    const config = await getConfig();
    if (regionRedirect(config, tab.url || '')) throw new Error('Abre la versión de EE. UU. de esta página para extraer.');
    const site = findSite(config, tab.url || '');
    if (!site) throw new Error(`Abre una página de un sitio disponible: ${sitesOf(config).map(s => s.name).join(', ')}.`);
    const cfg = siteConfig(config, site);
    if (!enRutaPropia(cfg, tab.url)) throw new Error(cfg.onlyPath.message || 'Esta región del sitio no se extrae.');
    const url = normalizeUrl(tab.url, cfg);
    const enCola = jobForUrl(await getJobs(), url);
    if (enCola) throw new Error(`Esta página ya está ${enCola.progreso ? 'en extracción' : 'en la cola'} («${enCola.nombreGrupo}»).`);
    pending = {
      tabId: tab.id, url, title: tab.title || '', replace: false, site, cfg,
      label: pageLabel(site, tab.url, tab.title || ''),
      // Límite solo en listados con páginas (loadMore.urlPattern, si el sitio lo define).
      usaLimite: !!cfg.loadMore?.item && !pageTypeByUrl(cfg, tab.url) && listadoConPaginas(cfg, tab.url),
      tabUrl: tab.url,
    };

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
  $('groupName').value = defaultGroupName(pending.label, ...groupsToCheck(groups, prefs));
  $('groupHint').textContent = 'Se verá en la columna ref_grupo del Excel.';
  $('groupHint').className = 'hint';
  // Máximo de productos: el último usado en este sitio, o 50.
  $('limitGroup').hidden = !pending.usaLimite;
  if (pending.usaLimite) {
    // Lo último usado en este sitio; la primera vez, 1 página (solo la actual).
    const { loadPrefs = {} } = await chrome.storage.local.get('loadPrefs');
    const p = loadPrefs[pending.site.id] || {};
    // Listados sin páginas (scroll infinito de Marc Jacobs): solo por productos.
    const soloProductos = soloPorProductos();
    $('limitPages').closest('.mode-switch').hidden = soloProductos;
    const modo = soloProductos || p.modo === 'productos' ? 'productos' : 'paginas';
    setLimitMode(modo, modo === 'paginas' ? p.paginas || DEFAULT_PAGES : p.productos || pending.cfg.loadMore.defaultLimit || DEFAULT_LOAD_LIMIT);
  }
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
  const nombre = cleanGroupName($('groupName').value) || defaultGroupName(pending.label, existentes, excepto);
  if (nameTaken(existentes, nombre, excepto)) return { ok: false, error: 'Ya existe un grupo con ese nombre en la lista.' };
  return { ok: true, nombre };
}

// ---- Límite de la extracción: por páginas (por defecto, 1 = solo la actual) o por productos ----

let limitMode = 'paginas';
const soloPorProductos = () => { const m = pending?.cfg?.loadMore?.limitModes; return Array.isArray(m) && m.length === 1 && m[0] === 'productos'; };
const maxLimit = () => Number(pending?.cfg?.loadMore?.maxLimit) || MAX_LOAD_LIMIT;
const maxPages = () => Number(pending?.cfg?.loadMore?.maxPages) || MAX_PAGES;
const maxFor = modo => (modo === 'paginas' ? maxPages() : maxLimit());

// Número de la página abierta según la URL (Sephora ?currentPage=3, Amazon &page=3).
function currentPageNumber() {
  const param = pending?.cfg?.loadMore?.pageParam;
  if (!param) return 1;
  try { return Math.max(1, parseInt(new URL(pending.tabUrl).searchParams.get(param), 10) || 1); } catch { return 1; }
}

function setLimitMode(modo, valor) {
  limitMode = modo === 'productos' ? 'productos' : 'paginas';
  for (const [id, m] of [['limitPages', 'paginas'], ['limitProducts', 'productos']]) {
    $(id).classList.toggle('active', m === limitMode);
    $(id).setAttribute('aria-selected', String(m === limitMode));
  }
  $('loadLimit').max = String(maxFor(limitMode));
  if (valor !== undefined) $('loadLimit').value = String(valor);
  setLimitHint();
}

// Debajo del número: qué páginas se van a extraer, o hasta cuántos productos.
function setLimitHint(error = '') {
  const L = pending?.cfg?.loadMore || {};
  const boton = L.name || 'Load More';
  let ayuda;
  if (limitMode === 'paginas') {
    const n = Number($('loadLimit').value);
    const valido = Number.isInteger(n) && n >= 1 && n <= maxPages();
    if (!valido) ayuda = `Escribe cuántas páginas extraer, de 1 a ${maxPages()}.`;
    else if (L.pageParam) {
      const desde = currentPageNumber();
      ayuda = n === 1
        ? `Solo la página actual (página ${desde}).`
        : `Páginas a extraer: ${desde} a ${desde + n - 1}, siguiendo con "${boton}" (máx. ${maxPages()}).`;
    } else {
      const lote = Number(L.pageSize) || 0;
      ayuda = n === 1
        ? `Solo los productos que muestra la página, sin pulsar "${boton}".`
        : `La página actual y ${n - 1} ${n === 2 ? 'vez' : 'veces'} "${boton}"${lote ? ` (unos ${lote * n} productos)` : ''} (máx. ${maxPages()}).`;
    }
  } else {
    ayuda = L.mode === 'scroll'
      ? `Baja por la página y pasa con "${boton}" hasta llegar a este número (máx. ${maxLimit()}).`
      : L.mode === 'fetch'
        ? `Lee esta página y las siguientes ("${boton}") hasta llegar a este número (máx. ${maxLimit()}).`
        : `Pulsa "${boton}" hasta llegar a este número (máx. ${maxLimit()}).`;
  }
  $('limitHint').textContent = error || ayuda;
  $('limitHint').className = `hint${error ? ' error' : ''}`;
}

// Límite del formulario: { modo, valor } (entero entre 1 y el máximo del modo); null si no aplica.
function readLimit() {
  if (!pending.usaLimite) return { ok: true, limite: null };
  const n = Number($('loadLimit').value);
  const max = maxFor(limitMode);
  if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: `Escribe un número entero entre 1 y ${max}.` };
  return { ok: true, limite: { modo: limitMode, valor: n } };
}

// Al cambiar de modo, el número recordado de ese modo (o el valor inicial).
async function onLimitModeClick(modo) {
  if (modo === limitMode) return;
  const { loadPrefs = {} } = await chrome.storage.local.get('loadPrefs');
  const p = loadPrefs[pending.site.id] || {};
  setLimitMode(modo, modo === 'paginas' ? p.paginas || DEFAULT_PAGES : p.productos || pending.cfg.loadMore.defaultLimit || DEFAULT_LOAD_LIMIT);
  $('loadLimit').focus();
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

// Envía la extracción a la cola del service worker: sigue aunque el popup se cierre.
// `limite`: { modo: 'paginas' | 'productos', valor } o null (página sin límite).
async function enqueue(cat, nombreGrupo, limite = null) {
  const { tabId, tabUrl, url, title, replace, site, cfg } = pending;
  if (cat) await rememberCategory(cat.ruta);
  const job = {
    tabId, tabUrl, url, title, replace, cfg, cat, nombreGrupo, limite,
    site: { id: site.id, name: site.name },
    fileName: pending.fileName || '',
    paginaInicial: currentPageNumber(),
    conNumeroDePagina: !!cfg.loadMore?.pageParam,
  };
  const r = await chrome.runtime.sendMessage({ type: 'enqueue', job });
  if (!r || r.error) return showStatus(`No se pudo iniciar la extracción${r?.error ? `: ${r.error}` : '.'}`, 'error');
  showStatus(r.posicion
    ? `En cola (posición ${r.posicion}): «${nombreGrupo}». Empezará cuando termine la extracción en curso.`
    : `Extracción iniciada: «${nombreGrupo}».\nPuedes cerrar este popup o ir a otra página: avisaré al terminar.`);
  pending = null;
  renderJobs();
}

const limiteTxt = l => (!l ? 'toda la página'
  : l.modo === 'paginas' ? `${l.valor} página${l.valor === 1 ? '' : 's'}` : `${l.valor} productos`);

// Extracción en curso y cola (las ejecuta el service worker). Se actualiza sola
// mientras el popup está abierto (storage.onChanged).
async function renderJobs() {
  const st = await getJobs();
  const a = st.actual;
  $('jobsPanel').hidden = !a && !st.cola.length;
  $('jobCurrent').hidden = !a;
  if (a) {
    const p = a.progreso || {};
    $('jobTitle').textContent = `⏳ Extrayendo «${a.nombreGrupo}» (${a.site.name})`;
    const avance = p.paginas ? `Página ${p.pagina || 1} de ${p.paginas}`
      : p.limite ? `${p.cargados ?? 0} de ${p.limite} productos` : 'Leyendo la página…';
    const cuenta = p.paginas && p.cargados != null ? ` · ${p.cargados} productos` : '';
    $('jobProgress').textContent = p.pausada
      ? `⏸ En pausa: vuelve a la pestaña de ${a.site.name} para continuar (${avance}). Esta página solo se lee con la pestaña a la vista.`
      : `${avance}${cuenta}. No cierres esa pestaña.`;
    $('jobProgress').className = `hint${p.pausada ? ' error' : ''}`;
    $('jobGo').onclick = () => chrome.runtime.sendMessage({ type: 'focusJob', tabId: a.tabId });
  }
  $('jobQueueTitle').hidden = !st.cola.length;
  $('jobQueueTitle').textContent = `En cola (${st.cola.length}):`;
  $('jobQueue').replaceChildren(...st.cola.map((j, i) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: `${i + 1}. «${j.nombreGrupo}» · ${j.site.name} · ${limiteTxt(j.limite)}` }));
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 'mini', textContent: '✕', title: 'Quitar de la cola' });
    x.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'removeJob', id: j.id }));
    li.append(x);
    return li;
  }));
}

// Al terminar una extracción con el popup abierto, se muestra su resultado.
let ultimoVisto = null;
function onStorageChanged(changes, area) {
  if (area !== 'local') return;
  if (changes.jobs) {
    renderJobs();
    const u = changes.jobs.newValue?.ultimo;
    if (u && u.id !== ultimoVisto && u.id !== changes.jobs.oldValue?.ultimo?.id) {
      ultimoVisto = u.id;
      showStatus(u.mensaje, u.ok ? 'success' : 'error');
      chrome.runtime.sendMessage({ type: 'seen' });
    }
  }
  if (changes.collected || changes.groups) renderCollection();
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
    const limit = readLimit();
    if (!limit.ok) {
      setLimitHint(limit.error);
      return $('loadLimit').focus();
    }
    if (limit.limite) {
      // Se recuerdan por sitio el modo y el número de cada modo.
      const { loadPrefs = {} } = await chrome.storage.local.get('loadPrefs');
      const { modo, valor } = limit.limite;
      const previo = loadPrefs[pending.site.id] || {};
      await chrome.storage.local.set({ loadPrefs: { ...loadPrefs, [pending.site.id]: { ...previo, modo, [modo]: valor } } });
    }
    pending.fileName = $('fileName').value;
    hideCategoryForm();
    enqueue(choice.cat, group.nombre, limit.limite);
  });
  $('jobStop').addEventListener('click', async () => {
    $('jobStop').disabled = true;
    $('jobProgress').textContent = 'Deteniendo… se guardará lo leído hasta ahora.';
    await chrome.runtime.sendMessage({ type: 'stopJob' });
    setTimeout(() => { $('jobStop').disabled = false; }, 3000);
  });
  chrome.storage.onChanged.addListener(onStorageChanged);
  $('loadLimit').addEventListener('input', () => setLimitHint());
  $('limitPages').addEventListener('click', () => onLimitModeClick('paginas'));
  $('limitProducts').addEventListener('click', () => onLimitModeClick('productos'));
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
      const r = await downloadXlsx(productsForExport(collected, groups), await getConfig(), catalogCache.items, $('exportName').value);
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
  await renderSite(config);
  renderCollection();
  renderJobs();
  // Abrir el popup "ve" el último resultado: el icono deja de mostrar ✓.
  const { ultimo } = await getJobs();
  ultimoVisto = ultimo?.id || null;
  chrome.runtime.sendMessage({ type: 'seen' }).catch(() => {});

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
