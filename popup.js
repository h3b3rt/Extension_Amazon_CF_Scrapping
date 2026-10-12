import { getConfig, getConfigMeta, refreshRemoteConfig, compareVersions, extensionVersion } from './config.js';
import { normalizeUrl, getHistory, removeHistoryEntry, formatDate } from './history.js';
import { getPrefs } from './prefs.js';
import { exportSummary, exportFileName, DEFAULT_PREFIX } from './export.js';
import { descargarLista, encoladaTxt } from './descarga.js';
import { getJobs, jobForUrl } from './jobs.js';
import {
  MAX_GROUP_NAME, cleanGroupName, nameTaken, defaultGroupName, syncGroups, sortedGroups, opcionesDe, siNo, quitadosTxt,
} from './groups.js';
import { getCachedCategories, getCategories } from './categories.js';
import { crearSelector, recordarCategoria } from './selector-categoria.js';
import {
  appName, sitesOf, findSite, siteConfig, siteTitle, siteIcon, DEFAULT_ICON, productKey, pageLabel, pageTypeByUrl, regionRedirect,
} from './sites.js';

const $ = id => document.getElementById(id);
const STALE_MS = 30 * 60 * 1000;
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
// Categorías del sistema (caché o lista incluida) y el selector del formulario.
let catalogCache = null;
let selector = null;

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
  $('preview').disabled = !n;
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
    // Opciones del grupo, fijas desde la extracción: siempre a la vista.
    const o = opcionesDe(g);
    const tags = Object.assign(document.createElement('div'), { className: 'tags' });
    for (const [txt, on] of [['Variaciones', o.variaciones], ['Guía de tallas', o.guiaTalla]]) {
      tags.append(Object.assign(document.createElement('span'), { className: `tag${on ? ' on' : ''}`, textContent: `${txt}: ${siNo(on)}` }));
    }
    li.append(tags);
    if (abiertos.has(g.id)) {
      const det = document.createElement('div');
      det.className = 'group-details';
      const fecha = g.fecha ? `Extraído: ${formatDate(g.fecha)}` : '';
      det.textContent = [...(g.resumen || ['Sin resumen (extraído con una versión anterior).']), quitadosTxt(g), fecha].filter(Boolean).join('\n');
      if (n) {
        const ver = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn see-group', textContent: 'Ver sus productos en la vista previa' });
        ver.addEventListener('click', () => openPreview(g.id));
        det.append('\n', ver);
      }
      li.append(det);
    }
    return li;
  });
  $('sources').replaceChildren(...items);
  $('sources').hidden = !items.length;
}

// Vista previa del Excel en una pestaña (preview.html), opcionalmente de un solo grupo.
function openPreview(grupo = '') {
  const url = chrome.runtime.getURL(`preview.html${grupo ? `?grupo=${encodeURIComponent(grupo)}` : ''}`);
  chrome.tabs.create({ url });
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

// Logo del sitio (o el icono general si no tiene o el paquete no lo trae).
function setIcon(img, site, size) {
  const general = DEFAULT_ICON[size];
  img.onerror = () => { img.onerror = null; img.src = general; };
  img.src = siteIcon(site)?.[size] || general;
}

// Título del popup según el sitio de la pestaña; fuera de los sitios disponibles,
// el nombre general y la lista de sitios con su enlace.
async function renderSite(config) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Otra región del sitio: no se extrae; se ofrece abrir la página en EE. UU.
  const region = regionRedirect(config, tab?.url || '', tab?.title || '');
  const site = region ? null : findSite(config, tab?.url || '');
  $('appTitle').textContent = site ? siteTitle(site) : region ? siteTitle(region.site) : appName(config);
  setIcon($('appIcon'), site || region?.site, 32);
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
    const img = Object.assign(document.createElement('img'), { className: 'site-icon', alt: '' });
    setIcon(img, s, 32);
    if (/^https:\/\//i.test(s.homeUrl || '')) {
      const a = Object.assign(document.createElement('a'), { href: s.homeUrl, target: '_blank' });
      a.append(img, s.name);
      li.append(a);
    } else {
      li.append(img, s.name);
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

// Pide la categoría antes de cada extracción, con el selector de la vista previa
// (selector-categoria.js): se busca por cualquier parte de la ruta o por código, o
// se elige por niveles. Propone la de la extracción anterior de esta página o la
// última usada.
async function askCategory() {
  const { recentCategories = [], categoryMode = 'search' } = await chrome.storage.local.get(['recentCategories', 'categoryMode']);
  // Siempre empieza desmarcada: "No llenar categoría" es la excepción, no la regla.
  $('multiCategory').checked = false;
  selector = crearSelector({
    actual: pending?.previous?.categoria || recentCategories[0] || '',
    recientes: recentCategories,
    modo: categoryMode,
    onEscape: hideCategoryForm,
  });
  $('categoryPicker').replaceChildren(selector.nodo);
  // La caché incluye lo descargado con "↻ Actualizar" en un formulario anterior.
  if (catalogCache) selector.cargar(catalogCache = await getCachedCategories());
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
  // Opciones del grupo: siempre empiezan en No.
  $('optVariaciones').checked = false;
  $('optGuiaTalla').checked = false;
  updateOptionsHint();
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
  selector.enfocar();
}

// Categoría del formulario: { ok, cat } con los 3 niveles y el código, o el motivo.
// cat null = "No llenar categoría" (columnas vacías para completar a mano).
function readCategory() {
  if ($('multiCategory').checked) return { ok: true, cat: null };
  return selector.leer();
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

// Qué cambia con "Extraer variantes" en este sitio (Amazon: familias; Kate Spade:
// familias siempre, con o sin variantes).
function updateOptionsHint() {
  const amazon = pending?.site?.id === 'amazon' && pending?.cfg?.familias;
  if (pending?.cfg?.familias?.siempre) {
    $('optionsHint').textContent = `Una fila por familia de ${pending.site.name} (con o sin variantes): verifica la familia de cada producto (más lento).`;
    return;
  }
  $('optionsHint').textContent = !amazon ? 'Se aplican a todas las filas de este grupo en el Excel.'
    : $('optVariaciones').checked
      ? 'Con variantes: una fila por familia de Amazon (el sistema extrae toda la familia). Verifica la familia de cada producto (más lento).'
      : 'Sin variantes: cada ASIN es un producto aparte; no se verifican familias.';
}

// Envía la extracción a la cola del service worker: sigue aunque el popup se cierre.
// `limite`: { modo: 'paginas' | 'productos', valor } o null (página sin límite).
async function enqueue(cat, nombreGrupo, limite = null) {
  const { tabId, tabUrl, url, title, replace, site } = pending;
  if (cat) await recordarCategoria(cat.ruta);
  const opciones = { variaciones: $('optVariaciones').checked, guiaTalla: $('optGuiaTalla').checked };
  // Sin variantes, el sistema crea solo cada ASIN: no se agrupan por familia
  // (salvo los sitios con familias.siempre, como Kate Spade).
  const cfg = opciones.variaciones || pending.cfg.familias?.siempre ? pending.cfg : { ...pending.cfg, familias: null };
  const job = {
    tabId, tabUrl, url, title, replace, cfg, cat, nombreGrupo, limite, opciones,
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
  $('jobConfirm').hidden = !a?.confirmacion;
  if (a?.tipo === 'exportar') {
    const p = a.progreso || {};
    $('jobTitle').textContent = '⏳ Exportando el Excel';
    $('jobProgress').textContent = p.total
      ? `Verificando la familia de los productos: ${p.verificando} de ${p.total} (con pausas para que el sitio no pida verificación). Puedes cerrar este popup.`
      : 'Preparando el archivo…';
    $('jobProgress').className = 'hint';
    $('jobGo').hidden = true;
    $('jobStop').textContent = 'Detener y exportar lo verificado';
  } else if (a) {
    const p = a.progreso || {};
    $('jobGo').hidden = false;
    $('jobStop').textContent = 'Detener y guardar lo leído';
    $('jobTitle').textContent = `⏳ Extrayendo «${a.nombreGrupo}» (${a.site.name})`;
    // Amazon y Kate Spade: el límite de productos cuenta familias (un producto por familia).
    const conFamilias = p.familias != null;
    const avance = p.paginas ? `Página ${p.pagina || 1} de ${p.paginas}`
      : p.limite ? `${p.cargados ?? 0} de ${p.limite} ${conFamilias ? 'familias' : 'productos'}` : 'Leyendo la página…';
    const cuenta = conFamilias
      ? ` · ${p.analizados ?? 0} productos analizados${p.paginas ? `, ${p.familias} familias` : ''}${p.verificando ? ' (verificando familias…)' : ''}`
      : p.paginas && p.cargados != null ? ` · ${p.cargados} productos` : '';
    $('jobProgress').textContent = p.pausada
      ? `⏸ En pausa: vuelve a la pestaña de ${a.site.name} para continuar (${avance}). Esta página solo se lee con la pestaña a la vista.`
      : `${avance}${cuenta}. No cierres esa pestaña.`;
    $('jobProgress').className = `hint${p.pausada ? ' error' : ''}`;
    $('jobGo').onclick = () => chrome.runtime.sendMessage({ type: 'focusJob', tabId: a.tabId });
    if (a.confirmacion) {
      const c = a.confirmacion;
      $('jobConfirmText').textContent = `⏸ Se analizaron ${c.analizados} productos y hay ${c.familias} familias (varios productos eran de la misma familia).\n¿Seguir con las páginas siguientes hasta tener ${c.limite} familias, o detener y guardar las ${c.familias}?`;
    }
  }
  $('jobButtons').hidden = !!a?.confirmacion;
  $('jobQueueTitle').hidden = !st.cola.length;
  $('jobQueueTitle').textContent = `En cola (${st.cola.length}):`;
  $('jobQueue').replaceChildren(...st.cola.map((j, i) => {
    const li = document.createElement('li');
    const var_ = j.opciones ? ` · variantes: ${siNo(j.opciones.variaciones)}` : '';
    const txt = j.tipo === 'exportar' ? `${i + 1}. Exportar el Excel` : `${i + 1}. «${j.nombreGrupo}» · ${j.site.name} · ${limiteTxt(j.limite)}${var_}`;
    li.append(Object.assign(document.createElement('span'), { textContent: txt }));
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
      selector.avisar(choice.error);
      return selector.enfocar();
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
  // Confirmación de familias: seguir hasta el límite o detener y guardar.
  for (const [id, respuesta] of [['jobContinue', 'seguir'], ['jobHalt', 'detener']]) {
    $(id).addEventListener('click', async () => {
      $('jobContinue').disabled = true;
      $('jobHalt').disabled = true;
      await chrome.runtime.sendMessage({ type: 'answerJob', respuesta });
      $('jobContinue').disabled = false;
      $('jobHalt').disabled = false;
    });
  }
  chrome.storage.onChanged.addListener(onStorageChanged);
  $('loadLimit').addEventListener('input', () => setLimitHint());
  $('optVariaciones').addEventListener('change', updateOptionsHint);
  $('limitPages').addEventListener('click', () => onLimitModeClick('paginas'));
  $('limitProducts').addEventListener('click', () => onLimitModeClick('productos'));
  $('groupName').addEventListener('input', () => {
    $('groupHint').textContent = 'Se verá en la columna ref_grupo del Excel.';
    $('groupHint').className = 'hint';
  });
  $('multiCategory').addEventListener('change', () => {
    selector?.apagar($('multiCategory').checked);
    selector?.enfocar();
  });
  $('cancelCategory').addEventListener('click', hideCategoryForm);
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
      const r = await descargarLista(collected, groups, (await getCachedCategories()).items, $('exportName').value);
      hideExportForm();
      if (r.encolada) {
        showStatus(encoladaTxt(r.encolada));
        return renderJobs();
      }
      showStatus(exportSummary(r), 'success');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'No se pudo generar el Excel.', 'error');
    }
  });
  $('cancelExport').addEventListener('click', hideExportForm);
  $('preview').addEventListener('click', () => openPreview());
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
  selector?.cargar(catalogCache);
  getCategories().then(fresh => {
    catalogCache = fresh;
    selector?.cargar(fresh);
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
