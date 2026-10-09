// Vista previa del Excel (preview.html, en una pestaña): las mismas filas que tendrá
// el archivo, calculadas con filasExcel (xlsx.js) sobre la lista actual, con sus
// avisos y los productos que no irán al Excel. Permite quitar productos de la lista
// (🗑 o selección), con Deshacer; lo hace el service worker (quitarProductos).
// Se actualiza sola cuando cambia la lista (por ejemplo, durante una extracción).
// Todo el contenido se arma con textContent: los datos vienen de páginas externas.
import { getConfig, extensionVersion } from './config.js';
import { getHistory } from './history.js';
import { syncGroups, sortedGroups, productsForExport } from './groups.js';
import { filasExcel } from './xlsx.js';
import { getJobs, sinFamilia } from './jobs.js';
import { getCachedCategories } from './categories.js';
import { sitesOf, siteIcon, DEFAULT_ICON } from './sites.js';
import { exportSummary, exportFileName, DEFAULT_PREFIX } from './export.js';
import { descargarLista, encoladaTxt } from './descarga.js';
import './familias.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter(c => c != null && c !== ''));
  return e;
};
const plural = (n, uno, varios = `${uno}s`) => `${n} ${n === 1 ? uno : varios}`;
const esHttps = u => /^https:\/\//i.test(u || '');

// Grupo pedido desde el popup ("Ver sus productos en la vista previa").
const grupoInicial = new URLSearchParams(location.search).get('grupo') || '';
let datos = null;
let config = null;
// Claves elegidas con las casillas y lo quitado en el último cambio (para Deshacer).
const seleccion = new Set();
let ultimoQuitado = null;
// Productos con el desplegable de variantes abierto (por clave) y variantes leídas de
// la página del producto (Sephora, Michael Kors, o extraídos antes de la v1.13.0): { variantes,
// dims } | { cargando } | { error }. Las leídas se guardan en storage.local
// (variantesLeidas) y se recuerdan 7 días.
const abiertos = new Set();
const cargadas = new Map();
const VIGENCIA_MS = 7 * 24 * 3600 * 1000;
// Versión de lo guardado: sube cuando cambia cómo se leen (lo anterior se vuelve a buscar).
const VERSION_LEIDAS = 5;
// Búsqueda automática de las variantes (Sephora, Michael Kors), una a una (detenida tras un bloqueo).
const cola = { activa: false, detenida: false };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ---------- datos ----------

async function cargar() {
  const { collected = {}, groups = {}, variantesLeidas = {} } = await chrome.storage.local.get(['collected', 'groups', 'variantesLeidas']);
  for (const [k, v] of Object.entries(variantesLeidas)) {
    if (cargadas.get(k)?.variantes || v?.version !== VERSION_LEIDAS || !Array.isArray(v.variantes) || !(Date.now() - (v.fecha || 0) < VIGENCIA_MS)) continue;
    cargadas.set(k, { variantes: v.variantes, dims: Array.isArray(v.dims) ? v.dims : [], ...(typeof v.nota === 'string' && v.nota ? { nota: v.nota } : {}), ...(Array.isArray(v.aparte) && v.aparte.length ? { aparte: v.aparte } : {}) });
  }
  // Productos de versiones anteriores sin grupo: el mismo reparto que hace el popup
  // (aquí solo en memoria; el popup lo guarda).
  syncGroups(collected, groups, await getHistory());
  config = await getConfig();
  const X = config.xlsx || {};
  const preparados = productsForExport(collected, groups);
  const { productos, omitidos } = globalThis.__cfFamilias.unoPorFamilia(preparados, config);
  const { filas, sinSku, resumen } = filasExcel(productos, X);
  // Productos cuya familia se verificará al descargar: pueden salir del Excel.
  const pendientes = new Set(sinFamilia(collected, groups, config).map(k => idDe(collected[k], X)));
  const fuera = [
    ...omitidos.map(o => {
      const p = preparados.find(x => x.asin === o.asin && x.familia === o.familia) || { asin: o.asin };
      return { motivo: `Familia repetida: se conserva ${o.conservado}`, p };
    }),
    ...sinSku.map(p => ({ motivo: 'Sin SKU (el sistema descartaría la fila)', p })),
  ];
  // Productos que hoy no van al Excel por repetir familia, por familia: entran en su
  // lugar si se quita el que la representa.
  const omitidosPorFamilia = new Map();
  for (const o of omitidos) {
    const p = fuera.find(f => f.p.asin === o.asin && f.p.familia === o.familia)?.p;
    if (!p?.clave) continue;
    const k = familiaDe(p, X);
    if (!omitidosPorFamilia.has(k)) omitidosPorFamilia.set(k, []);
    omitidosPorFamilia.get(k).push(p);
  }
  const { jobs } = await chrome.storage.local.get('jobs');
  return {
    filas, fuera, resumen, pendientes, omitidosPorFamilia,
    claves: new Set(Object.keys(collected)),
    total: Object.keys(collected).length,
    grupos: sortedGroups(groups),
    condicionNormal: X.condicion?.default || 'Nuevo',
    extrayendo: jobs?.actual || null,
    // La verificación de familias de una exportación escribe la lista: no se quita nada.
    bloqueado: jobs?.actual?.tipo === 'exportar',
  };
}

const ecomerceDe = (p, X) => p.ecomerce || X.ecomerce || 'Amazon';
const idDe = (p, X) => `${ecomerceDe(p, X)}|${(p.asin || '').trim()}`;
// Misma clave de familia que unoPorFamilia (familias.js).
const familiaDe = (p, X) => (p.familia ? `${ecomerceDe(p, X)}:${p.familia}` : '');

// Avisos de una fila: los de ref_duplicado y lo que conviene revisar antes de subir.
function avisosDe(f) {
  const a = [];
  if (f.ref.duplicado) for (const t of f.ref.duplicado.split(' · ')) a.push({ txt: t });
  if (datos.pendientes.has(idDe(f.producto, config.xlsx || {}))) a.push({ txt: 'Familia por verificar al descargar' });
  if (!f.celdas.codigo_categoria) a.push({ txt: 'Sin categoría' });
  if (f.celdas.condicion !== datos.condicionNormal) a.push({ txt: `Condición: ${f.celdas.condicion}` });
  if (f.celdas.sku.includes('-')) a.push({ txt: 'SKU con guion (el sistema lo corta en el primer "-")', bad: true });
  return a;
}

// ---------- vista ----------

function iconoDeSitio(ecomerce) {
  const site = sitesOf(config).find(s => (s.ecomerce || s.name) === ecomerce);
  const img = el('img', { alt: '' });
  img.onerror = () => { img.onerror = null; img.src = DEFAULT_ICON[32]; };
  img.src = siteIcon(site)?.[32] || DEFAULT_ICON[32];
  return img;
}

function renderResumen() {
  const { resumen: r, fuera, pendientes, total } = datos;
  // Familias: representantes en el Excel y omitidos de su familia al extraer. El total
  // de variantes solo si todos los representantes traen su tamaño.
  const reps = datos.filas.map(f => f.producto).filter(representaFamilia);
  const omitidosAlExtraer = reps.reduce((s, p) => s + (p.familiaOmitidos || 0), 0);
  // Sephora y Michael Kors con *Extraer variantes*: sus variantes leídas (al menos la propia).
  const seph = datos.filas.map(f => f.producto).filter(buscaVariantes);
  const tonos = p => cargadas.get(p.clave)?.variantes;
  // Familias con cifras guardadas al extraer (Amazon); las de búsqueda automática (Kate
  // Spade) se cuentan con lo leído de su página, una sola vez.
  const repsGuardadas = reps.filter(p => !buscaVariantes(p));
  const todas = (repsGuardadas.length || seph.length) && repsGuardadas.every(p => p.familiaTam) && seph.every(tonos);
  const variantes = todas
    ? repsGuardadas.reduce((s, p) => s + p.familiaTam, 0) + seph.reduce((s, p) => s + Math.max(1, tonos(p).length), 0)
    : 0;
  const buscando = cola.activa ? seph.filter(p => !tonos(p) && !cargadas.get(p.clave)?.error).length : 0;
  const familia = fuera.filter(f => f.motivo.startsWith('Familia')).length;
  const chips = [
    ['ok', 'Filas en el Excel', r.filas],
    ['', 'Productos en la lista', total],
    ['', 'Omitidos por familia repetida', familia],
    ['bad', 'Sin SKU (no van)', r.omitidos],
    ['warn', 'Familia por verificar', pendientes.size],
    ['warn', 'Familia sin verificar', r.sinFamilia],
    ['warn', 'Sin categoría', r.sinCategoria],
    ['warn', 'Posibles variantes repetidas', r.duplicados],
    ['warn', 'Reacondicionado', r.reacondicionados],
    ['bad', 'SKU con guion', r.conGuion],
    ['', 'Familias en el Excel', reps.length],
    ['', 'Variantes que creará el sistema', variantes],
    ['', 'Buscando variantes', buscando],
    ['', 'Omitidos al extraer (misma familia)', omitidosAlExtraer],
  ].filter(([, , n], i) => i < 2 || n);
  $('chips').replaceChildren(...chips.map(([cls, txt, n]) => el('span', { className: `chip ${cls}` }, `${txt}: `, el('b', { textContent: n }))));
  $('pendingNote').hidden = !pendientes.size;
  $('pendingNote').textContent = pendientes.size
    ? `Al descargar se verificará la familia de ${plural(pendientes.size, 'producto')} (unos ${Math.max(1, Math.round(pendientes.size * 3.5 / 60))} min). Los que repitan una familia ya incluida saldrán del Excel, así que puede tener menos filas que las que se ven aquí.`
    : '';
  const ex = datos.extrayendo;
  $('live').hidden = !ex;
  $('live').textContent = ex ? `${ex.tipo === 'exportar' ? 'Exportación' : 'Extracción'} en curso: esta vista se actualiza sola.` : '';
  $('subtitle').textContent = `Lista actual: ${plural(total, 'producto')} en ${plural(datos.grupos.length, 'grupo')} · v${extensionVersion()}`;
}

// Opciones de un <select> conservando la elección si sigue existiendo.
function setOptions(select, opciones, inicial) {
  // La elección inicial (grupo pedido desde el popup) solo cuenta la primera vez.
  const actual = select.dataset.listo ? select.value : inicial;
  select.dataset.listo = '1';
  select.replaceChildren(...opciones.map(([v, t]) => el('option', { value: v, textContent: t })));
  select.value = opciones.some(([v]) => v === actual) ? actual : '';
}

function renderFiltros() {
  const grupoIni = datos.grupos.find(g => g.id === grupoInicial)?.nombre || '';
  setOptions($('groupFilter'), [['', 'Todos los grupos'], ...datos.grupos.map(g => [g.nombre, g.nombre])], grupoIni);
  const sitios = [...new Set(datos.filas.map(f => f.celdas.ecomerce))];
  setOptions($('siteFilter'), [['', 'Todos los sitios'], ...sitios.map(s => [s, s])], '');
  $('siteFilter').hidden = sitios.length < 2;
}

function visible(f, avisos) {
  const q = $('search').value.trim().toLowerCase();
  const p = f.producto;
  if ($('groupFilter').value && f.ref.grupo !== $('groupFilter').value) return false;
  if ($('siteFilter').value && f.celdas.ecomerce !== $('siteFilter').value) return false;
  if ($('warnFilter').checked && !avisos.length) return false;
  const deVariantes = (Array.isArray(p.variantes) && tieneVariantes(p) ? p.variantes : []).flatMap(v => [v.sku, ...(v.atributos || [])]);
  if (q && ![p.nombre, p.marca, p.asin, p.link, p.variante, ...deVariantes].some(v => String(v || '').toLowerCase().includes(q))) return false;
  return true;
}

function celdaSku(f) {
  if (f.celdas.sku) return el('td', { className: 'sku' }, el('span', { className: 'mono', textContent: f.celdas.sku }));
  // Todos menos Amazon: la celda sku va vacía; el bot saca el SKU del link.
  // Debajo, como referencia, el skuId (Sephora) o el estilo (los demás).
  const td = el('td', { className: 'sku' });
  td.append(el('span', { className: 'muted', textContent: 'Vacía (va en el link)' }));
  if (f.ref.variante) td.append(el('div', { className: 'mono', textContent: `skuId ${f.ref.variante}` }));
  else if (f.producto.asin) td.append(el('div', { className: 'mono muted', textContent: f.producto.asin }));
  return td;
}

// Casilla de selección y 🗑 de un producto (tabla del Excel y "No irán al Excel").
function celdaQuitar(p, tr) {
  const td = el('td', { className: 'sel' });
  const nombre = p.nombre || p.asin || 'este producto';
  const check = el('input', { type: 'checkbox', checked: seleccion.has(p.clave), disabled: datos.bloqueado });
  check.setAttribute('aria-label', `Seleccionar ${nombre}`);
  check.addEventListener('change', () => {
    if (check.checked) seleccion.add(p.clave);
    else seleccion.delete(p.clave);
    tr.classList.toggle('selected', check.checked);
    renderSeleccion();
  });
  const trash = el('button', { type: 'button', className: 'trash', textContent: '🗑', title: 'Quitar de la lista', disabled: datos.bloqueado });
  trash.setAttribute('aria-label', `Quitar ${nombre} de la lista`);
  trash.addEventListener('click', () => pedirQuitar([p.clave]));
  tr.classList.toggle('selected', check.checked);
  td.append(check, trash);
  return td;
}

// Familia del producto (Amazon con variantes, Kate Spade): variantes que el sistema
// crea desde él y cuántas de la familia se omitieron al extraer. Solo informativo.
// Los extraídos antes de la v1.12.0 no traen esas cifras.
function celdaFamilia(p) {
  const td = el('td', { className: 'fam' });
  // Con búsqueda automática (Sephora, Michael Kors, Marc Jacobs, Kate Spade) la celda
  // muestra lo leído de la página; si no, las cifras guardadas al extraer (Amazon).
  const familia = representaFamilia(p) && !buscaVariantes(p);
  if (!familia && !buscaVariantes(p)) {
    td.append(el('span', { className: 'muted', textContent: '—' }));
    return td;
  }
  if (familia) {
    const unidad = p.ecomerce === 'Kate Spade' ? 'estilo' : 'variante';
    const tam = p.familiaTam === 1 ? 'Sin variantes' : p.familiaTam ? plural(p.familiaTam, unidad) : 'Representa su familia';
    td.append(el('div', { textContent: tam }));
  } else {
    // Sephora, Michael Kors: se cuentan al leerlas de su página (búsqueda automática).
    const c = cargadas.get(p.clave);
    const boton = (texto, accion) => {
      const b = el('button', { type: 'button', className: 'toggle', textContent: texto });
      b.addEventListener('click', accion);
      return b;
    };
    if (c?.variantes) {
      td.append(el('div', { textContent: c.variantes.length > 1 ? plural(c.variantes.length, 'variante') : 'Sin variantes' }));
      // Sin otras variantes pero la página ofrece tamaños o colores de otro modelo
      // (Marc Jacobs: SMALL y LARGE son estilos distintos): se dice cuál es.
      if (c.variantes.length <= 1 && c.aparte?.length) {
        const pids = [...new Set(c.aparte.map(a => a.pid))];
        const de = (tipo, uno, varios) => { const l = c.aparte.filter(a => a.tipo === tipo).map(a => a.nombre); return l.length ? `${l.length === 1 ? uno : varios} ${l.join(', ')}` : ''; };
        const que = [de('talla', 'tamaño', 'tamaños'), de('color', 'color', 'colores')].filter(Boolean).join(' · ');
        td.append(el('div', { className: 'muted', textContent: `Otro modelo (${pids.join(', ')}): ${que}` }));
      }
    }
    else if (c?.error) {
      td.append(el('div', { className: 'err', textContent: 'No se pudieron leer', title: c.error }),
        boton('Reintentar', () => { cargadas.delete(p.clave); cola.detenida = false; renderFilas(); buscarVariantes(); }));
    } else if (cola.detenida && !cola.activa && !c) {
      td.append(el('div', { className: 'muted', textContent: 'Variantes sin leer' }),
        boton('Buscar variantes', () => { cola.detenida = false; buscarVariantes(); }));
    } else td.append(el('div', { className: 'muted', textContent: 'Buscando variantes…' }));
  }
  if (tieneVariantes(p)) {
    const abierto = abiertos.has(p.clave);
    const btn = el('button', { type: 'button', className: 'toggle', textContent: abierto ? '▾ Ocultar variantes' : '▸ Ver variantes' });
    btn.setAttribute('aria-expanded', String(abierto));
    btn.addEventListener('click', () => {
      if (abierto) abiertos.delete(p.clave);
      else abiertos.add(p.clave);
      renderFilas();
    });
    td.append(btn);
  }
  if (!familia) return td;
  if (p.familiaOmitidos) td.append(el('div', { className: 'muted', textContent: `${plural(p.familiaOmitidos, 'omitido')} al extraer` }));
  else if (!p.familiaTam) {
    td.append(el('div', { className: 'muted', textContent: 'sin cifras', title: 'Extraído antes de la v1.12.0, o su familia ya se conocía sin descargar su página' }));
  }
  return td;
}

// ---------- variantes de la familia (desplegable) ----------

// ¿Tiene otras variantes que mostrar? Un "Sin variantes" (familiaTam 1) no,
// salvo que traiga varias (Kate Spade: un solo estilo con varios colores).
// Sephora y Michael Kors no tienen familias: con *Extraer variantes* en el grupo el
// sistema crea todas las variantes del producto (tonos; colores y tallas), que se
// buscan solas al abrir la vista previa.
const buscaVariantes = p => !!p.conVariaciones && globalThis.__cfFamilias.leeVariantes(p);
const tieneVariantes = p => (buscaVariantes(p)
  ? cargadas.get(p.clave)?.variantes?.length > 1
  : representaFamilia(p) && (p.variantes?.length > 1 || p.familiaTam !== 1));

// Variantes del producto y sus dimensiones (Amazon: talla, color…): las guardadas al
// extraer o las cargadas en esta pestaña. null si no hay ninguna.
function variantesDe(p) {
  const c = cargadas.get(p.clave);
  if (c?.variantes) return { vs: c.variantes, dims: c.dims || [] };
  if (Array.isArray(p.variantes) && p.variantes.length) return { vs: p.variantes, dims: Array.isArray(p.variantesDims) ? p.variantesDims : null };
  return null;
}

// Guarda las variantes leídas (no la lista: clave aparte, sin competir con el service
// worker) y poda las de productos que ya no están en la lista.
async function guardarLeida(clave, dato) {
  try {
    const { variantesLeidas = {}, collected = {} } = await chrome.storage.local.get(['variantesLeidas', 'collected']);
    for (const k of Object.keys(variantesLeidas)) if (!(k in collected)) delete variantesLeidas[k];
    if (clave in collected) variantesLeidas[clave] = { variantes: dato.variantes, dims: dato.dims, ...(dato.nota ? { nota: dato.nota } : {}), ...(dato.aparte ? { aparte: dato.aparte } : {}), fecha: Date.now(), version: VERSION_LEIDAS };
    await chrome.storage.local.set({ variantesLeidas });
  } catch (e) { console.warn('No se guardaron las variantes', e); }
}

// Descarga una vez la página del producto para leer sus variantes (Sephora, o
// productos extraídos antes de que se guardaran). No cambia la lista.
async function cargarVariantes(p) {
  const Fam = globalThis.__cfFamilias;
  const F = Fam.porEcomerce(config)[Fam.ecomerceDe(p)]?.F;
  cargadas.set(p.clave, { cargando: true });
  renderFilas();
  const r = Fam.leeVariantes(p) ? await Fam.descargarVariantes(p)
    : F ? await Fam.descargar(p.asin, F, undefined, p.link) : { error: 'el sitio no tiene familias' };
  const ok = !!(r.familia || r.variantes);
  const dato = ok
    ? { variantes: r.variantes || [], dims: r.dimensiones || [], ...(r.nota ? { nota: r.nota } : {}), ...(Array.isArray(r.aparte) && r.aparte.length ? { aparte: r.aparte } : {}) }
    : { error: r.error === 'captcha' ? 'el sitio pidió verificación (CAPTCHA); abre el producto en Chrome y vuelve a intentarlo' : r.error };
  cargadas.set(p.clave, dato);
  if (ok) await guardarLeida(p.clave, dato);
  renderFilas();
  renderResumen();
  return r;
}

// Productos del Excel (Sephora, Michael Kors) con *Extraer variantes* cuyas variantes faltan.
const porBuscar = () => (datos?.filas || []).map(f => f.producto).filter(p => buscaVariantes(p) && !cargadas.has(p.clave));

// Busca las variantes uno a uno, con la misma pausa que las familias (1,5–3 s)
// para no provocar bloqueos. Tras un bloqueo se detiene: el resto queda "sin leer".
async function buscarVariantes() {
  if (cola.activa) return;
  cola.activa = true;
  cola.detenida = false;
  renderResumen();
  try {
    for (let n = 0, p; (p = porBuscar()[0]); n++) {
      if (n) await esperar(globalThis.__cfFamilias.pausa({}));
      if (cargadas.has(p.clave) || !datos.claves.has(p.clave)) continue;
      const r = await cargarVariantes(p);
      if (r.error === 'captcha') { cola.detenida = true; break; }
    }
  } finally {
    cola.activa = false;
    renderFilas();
    renderResumen();
  }
}

// Fila con un mensaje bajo el producto (cargando, error, sin datos).
function filaMensaje(...hijos) {
  return el('tr', { className: 'variante' }, el('td'), el('td', { className: 'num', textContent: '↳' }), el('td', { colSpan: 11 }, ...hijos));
}

// Botón que lee las variantes de la página del producto, con el error anterior si hubo.
function filaCargar(p, texto, nota) {
  const c = cargadas.get(p.clave);
  if (c?.cargando) return filaMensaje(el('span', { className: 'muted', textContent: 'Cargando variantes…' }));
  const b = el('button', { type: 'button', className: 'toggle', textContent: c?.error ? 'Reintentar' : texto });
  b.addEventListener('click', () => cargarVariantes(p));
  return filaMensaje(
    c?.error ? el('div', { className: 'err', textContent: `No se pudieron cargar: ${c.error}.` }) : null,
    el('div', { className: 'muted', textContent: nota }),
    b,
  );
}

// Subfilas de las variantes de un producto, con las mismas columnas. Grupo,
// categoría, opciones y condición son las del producto: el sistema las aplica igual.
// Con dimensiones que no cambian la imagen (ropa: talla), una fila por color/modelo
// con sus tallas en chips; si no, una fila por variante.
function filasVariantes(f) {
  const p = f.producto;
  const d = variantesDe(p);
  if (!d) return [filaCargar(p, 'Cargar variantes', 'Se extrajo antes de la v1.13.0: sus variantes no se guardaron. Se pueden leer de la página del producto (una descarga).')];
  const { vs, dims } = d;
  if (!vs.length) return [filaMensaje(el('span', { className: 'muted', textContent: 'La página del producto no trae datos de sus variantes.' }))];

  const X = config.xlsx || {};
  // Productos de la lista de la misma familia ("No irán al Excel"): traen nombre y precio.
  const deLista = new Map((datos.omitidosPorFamilia.get(familiaDe(p, X)) || []).map(h => [String(h.asin).toUpperCase(), h]));
  let origen = 'https://www.amazon.com';
  try { if (esHttps(p.link)) origen = new URL(p.link).origin; } catch { /* link inválido */ }
  const mut = t => el('span', { className: 'muted', textContent: t || '—' });
  // La variante que va al Excel: el ASIN o estilo; en Sephora, el skuId del link.
  const idExcel = String((p.ecomerce === 'Sephora' ? p.variante : p.asin) || '').toUpperCase();
  const propio = sku => !!idExcel && String(sku || '').toUpperCase() === idExcel;
  // Amazon: /dp/ASIN en el mismo dominio del producto; Kate Spade trae su link.
  const linkDe = v => (esHttps(v.link) ? v.link : /^[A-Z0-9]{10}$/i.test(v.sku || '') && p.ecomerce !== 'Kate Spade' ? `${origen}/dp/${v.sku}` : '');

  // Fila con las columnas de la tabla. `datosFila`: imagen, nombre (o null: el del
  // producto, atenuado), atributos, extra (nodo bajo los atributos), precio, sku
  // (nodo), familia (texto), link y si contiene la variante que va al Excel.
  const fila = ({ imagen, nombre, atributos, extra, precio, sku, familia, link, este }) => {
    const tr = el('tr', { className: `variante${este ? ' este' : ''}` });
    tr.append(el('td'), el('td', { className: 'num', textContent: '↳' }));
    const tdImg = el('td', { className: 'img' });
    if (esHttps(imagen)) tdImg.append(el('img', { src: imagen, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }));
    else tdImg.append(mut('—'));
    tr.append(tdImg);

    const tdName = el('td', { className: 'name' });
    // Sin nombre propio (Amazon): el del producto, atenuado; puede nombrar otro color.
    tdName.append(el('div', { className: nombre ? '' : 'muted', textContent: nombre || p.nombre || '(sin nombre)' }));
    if (atributos) tdName.append(el('div', { className: 'attrs', textContent: atributos }));
    if (extra) tdName.append(extra);
    const pie = el('div');
    if (p.marca) pie.append(el('span', { className: 'marca', textContent: p.marca }));
    if (Number.isFinite(precio)) pie.append(p.marca ? ' · ' : '', el('span', { className: 'price', textContent: `$${precio.toFixed(2)}` }));
    if (pie.childNodes.length) tdName.append(pie);
    tr.append(tdName);

    tr.append(el('td', {}, mut('—')));
    tr.append(el('td', {}, el('span', { className: 'site' }, iconoDeSitio(f.celdas.ecomerce), f.celdas.ecomerce)));
    const tdSku = el('td', { className: 'sku' }, sku);
    if (este) tdSku.append(el('div', {}, el('span', { className: 'tag on', textContent: 'Va al Excel' })));
    tr.append(tdSku);
    tr.append(el('td', { className: 'fam' }, mut(familia)));

    const tdLink = el('td', { className: 'link' });
    if (link) {
      const u = new URL(link);
      tdLink.append(el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', title: u.href, textContent: `${u.hostname.replace(/^www\./, '')}${u.pathname}` }));
    } else tdLink.append(mut('—'));
    tr.append(tdLink);

    tr.append(el('td', {}, mut(f.ref.grupo)));
    tr.append(el('td', { className: 'cat' }, mut(f.celdas.codigo_categoria ? f.celdas['Buscar categoria'] : 'Elegir en la plantilla')));
    tr.append(el('td', {}, mut(`Variantes: ${f.celdas.variacion || 'No'} · Guía: ${f.celdas.guia_talla || 'No'}`)));
    tr.append(el('td', {}, mut(f.celdas.condicion)));
    return tr;
  };

  const filas = [];
  // Aviso al final (Marc Jacobs: colores de otro modelo que la página también muestra).
  const conNota = fs => (d.nota || cargadas.get(p.clave)?.nota ? [...fs, filaMensaje(el('span', { className: 'muted', textContent: d.nota || cargadas.get(p.clave).nota }))] : fs);
  // Variantes de Amazon guardadas sin dimensiones (versión de prueba): se pueden releer.
  if (dims === null && vs.some(v => v.atributos?.length > 1) && p.ecomerce !== 'Kate Spade') {
    filas.push(filaCargar(p, 'Actualizar variantes', 'Para agruparlas por color o modelo hay que volver a leer la página del producto (una descarga).'));
  }

  const n = vs[0].atributos?.length || 0;
  const usables = Array.isArray(dims) && dims.length === n && vs.every(v => v.atributos?.length === n);
  const visuales = usables ? dims.map((x, i) => (x.visual ? i : -1)).filter(i => i >= 0) : [];
  const otras = usables ? dims.map((x, i) => (x.visual ? -1 : i)).filter(i => i >= 0) : [];

  if (!visuales.length || !otras.length) {
    // Una fila por variante (todas cambian la imagen, o una sola dimensión).
    for (const v of vs) {
      const h = deLista.get(String(v.sku).toUpperCase());
      filas.push(fila({
        imagen: [v.imagen, h?.imagen].find(esHttps),
        nombre: h?.nombre || v.nombre,
        atributos: (v.atributos || []).join(' · '),
        extra: v.tamano ? el('div', { className: 'muted', textContent: v.tamano }) : null,
        precio: Number.isFinite(v.precio) ? v.precio : parseFloat(h?.precio),
        sku: el('span', { className: 'mono', textContent: String(v.sku || '') }),
        familia: propio(v.sku) ? 'Representa la familia' : `Variante de ${p.asin}`,
        link: linkDe(v),
        este: propio(v.sku),
      }));
    }
    return conNota(filas);
  }

  // Agrupadas por las dimensiones visuales (color), en el orden guardado (el de la página).
  const grupos = new Map();
  for (const v of vs) {
    const k = visuales.map(i => v.atributos[i]).join(' · ');
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(v);
  }
  const nombreVisual = visuales.map(i => dims[i].nombre).join(' / ');
  const nombreOtras = otras.map(i => dims[i].nombre).join(' / ');
  // El color del link del Excel, si lo trae: Michael Kors dwvar_<ID>_color=0001,
  // Marc Jacobs …/<ID>-002.html.
  const idLimpio = String(p.asin || '').replace(/[^A-Za-z0-9]/g, '');
  const colorExcel = p.ecomerce === 'Michael Kors'
    ? (String(p.link || '').match(new RegExp(`dwvar_${idLimpio}_color=(\\d{4})`, 'i')) || [])[1]
    : p.ecomerce === 'Marc Jacobs'
      ? (String(p.link || '').split('?')[0].match(new RegExp(`/${idLimpio}-([A-Za-z0-9]+)\\.html$`, 'i')) || [])[1]
      : '';
  for (const [k, lista] of grupos) {
    const este = lista.some(v => propio(v.sku)) || (!!colorExcel && lista.some(v => v.codigoColor === colorExcel));
    const chips = el('div', { className: 'chips-talla', title: nombreOtras });
    for (const v of lista) {
      const texto = otras.map(i => v.atributos[i]).join(' · ') || v.sku;
      const link = linkDe(v);
      const chip = link
        ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: `${nombreOtras} ${texto}: ${v.sku}${v.agotada ? ' (agotada)' : ''}`, textContent: texto })
        : el('span', { title: `${v.sku}${v.agotada ? ' (agotada)' : ''}`, textContent: texto });
      if (propio(v.sku)) chip.className = 'on';
      if (v.agotada) chip.classList.add('agotada');
      chips.append(chip);
    }
    filas.push(fila({
      // Un solo color sin imagen propia: la del producto (es el mismo color).
      imagen: lista.map(v => v.imagen).find(esHttps) || (grupos.size === 1 ? p.imagen : undefined),
      nombre: null,
      // Sin color en la página (solo tallas, p. ej. un abrigo de Kate Spade): no se
      // muestra el "—". En Amazon sí, porque la dimensión visual no siempre es el color.
      // (también "— (KP115)", guardado antes con el estilo de la familia).
      atributos: p.ecomerce !== 'Amazon' && k.split(' · ').every(x => /^(—\s*(\([^)]*\))?)?$/.test(x.trim())) ? '' : k,
      extra: chips,
      precio: lista.map(v => v.precio).find(Number.isFinite),
      sku: el('span', { textContent: `${plural(lista.length, p.ecomerce === 'Amazon' ? 'ASIN' : 'SKU', p.ecomerce === 'Amazon' ? 'ASIN' : 'SKU')}` }),
      familia: `${nombreVisual} de ${p.asin}`,
      link: linkDe(lista.find(v => propio(v.sku)) || lista[0]),
      este,
    }));
  }
  return conNota(filas);
}

function filaHtml(f, avisos) {
  const p = f.producto;
  const tr = el('tr', { className: avisos.length ? 'has-warn' : '' });
  tr.append(celdaQuitar(p, tr));
  // Número de producto (1, 2…) y, debajo, su fila en el Excel (la 1 es el
  // encabezado), que es la que citan los avisos "Posible variante: fila N".
  tr.append(el('td', { className: 'num', title: `Fila ${f.fila} del Excel` },
    el('div', { textContent: f.fila - 1 }), el('div', { className: 'excel-row', textContent: `fila ${f.fila}` })));

  const tdImg = el('td', { className: 'img' });
  if (esHttps(p.imagen)) tdImg.append(el('img', { src: p.imagen, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }));
  else tdImg.append(el('span', { className: 'muted', textContent: '—' }));
  tr.append(tdImg);

  const tdName = el('td', { className: 'name' });
  tdName.append(el('div', { textContent: p.nombre || '(sin nombre)' }));
  const extra = el('div');
  if (p.marca) extra.append(el('span', { className: 'marca', textContent: p.marca }));
  if (f.ref.precio !== '') extra.append(p.marca ? ' · ' : '', el('span', { className: 'price', textContent: `$${Number(f.ref.precio).toFixed(2)}` }));
  if (extra.childNodes.length) tdName.append(extra);
  tr.append(tdName);

  // Avisos junto al producto: es lo primero que hay que revisar.
  const ul = el('ul', { className: 'warns' });
  for (const a of avisos) ul.append(el('li', { className: a.bad ? 'bad' : '', textContent: a.txt }));
  tr.append(el('td', {}, avisos.length ? ul : el('span', { className: 'muted', textContent: '—' })));

  tr.append(el('td', {}, el('span', { className: 'site' }, iconoDeSitio(f.celdas.ecomerce), f.celdas.ecomerce)));
  tr.append(celdaSku(f));
  tr.append(celdaFamilia(p));

  const tdLink = el('td', { className: 'link' });
  if (esHttps(f.celdas.link)) {
    const u = new URL(f.celdas.link);
    tdLink.append(el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', title: u.href, textContent: `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}` }));
  } else if (!f.celdas.link && esHttps(p.link)) {
    // Amazon: la celda link va vacía (el bot usa el sku); el link, solo para abrirlo.
    tdLink.append(el('span', { className: 'muted', textContent: 'Vacía (va en el SKU)' }),
      el('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', title: p.link, textContent: p.link.replace(/^https:\/\/(www\.)?/, '') }));
  } else {
    tdLink.append(el('span', { className: 'muted', textContent: f.celdas.link || '—' }));
  }
  tr.append(tdLink);

  tr.append(el('td', { textContent: f.ref.grupo }));
  const tdCat = el('td', { className: 'cat' });
  if (f.celdas.codigo_categoria) {
    tdCat.append(el('div', { textContent: f.celdas['Buscar categoria'] }), el('div', { className: 'mono muted', textContent: f.celdas.codigo_categoria }));
  } else {
    tdCat.append(el('span', { className: 'muted', textContent: 'Elegir en la plantilla' }));
  }
  tr.append(tdCat);

  const tdOpc = el('td');
  for (const [t, v] of [['Variantes', f.celdas.variacion], ['Guía', f.celdas.guia_talla]]) {
    tdOpc.append(el('div', {}, el('span', { className: `tag${v === 'Sí' ? ' on' : ''}`, textContent: `${t}: ${v || 'No'}` })));
  }
  tr.append(tdOpc);
  tr.append(el('td', { textContent: f.celdas.condicion }));
  return tr;
}

// Claves de las filas que se ven con los filtros actuales ("seleccionar todas").
let clavesVisibles = [];

function renderFilas() {
  const conAvisos = datos.filas.map(f => [f, avisosDe(f)]);
  const vistas = conAvisos.filter(([f, a]) => visible(f, a));
  clavesVisibles = vistas.map(([f]) => f.producto.clave);
  $('rows').replaceChildren(...vistas.flatMap(([f, a]) => [
    filaHtml(f, a),
    ...(abiertos.has(f.producto.clave) && tieneVariantes(f.producto) ? filasVariantes(f) : []),
  ]));
  renderSeleccion();
  $('shown').textContent = vistas.length === datos.filas.length
    ? plural(datos.filas.length, 'fila')
    : `${vistas.length} de ${plural(datos.filas.length, 'fila')}`;
  $('emptyRows').hidden = !!vistas.length;
  $('emptyRows').textContent = datos.filas.length ? 'Ninguna fila coincide con los filtros.' : 'La lista está vacía: extrae productos desde el popup.';
}

function renderFuera() {
  $('outEmpty').hidden = !!datos.fuera.length;
  $('outTable').hidden = !datos.fuera.length;
  $('outRows').replaceChildren(...datos.fuera.map(({ motivo, p }) => {
    const tr = el('tr');
    tr.append(
      p.clave ? celdaQuitar(p, tr) : el('td'),
      el('td', { textContent: motivo }),
      el('td', { className: 'name', textContent: p.nombre || '(sin nombre)' }),
      el('td', { textContent: p.ecomerce || '' }),
      el('td', { className: 'mono', textContent: p.asin || '—' }),
      el('td', { textContent: p.grupo || '' }),
    );
    return tr;
  }));
}

// Botón "Quitar seleccionados" y casilla del encabezado (filas visibles).
function renderSeleccion() {
  const n = seleccion.size;
  $('removeSelected').hidden = !n;
  $('removeSelected').disabled = datos.bloqueado;
  $('removeSelected').textContent = `Quitar seleccionados (${n})`;
  const vis = clavesVisibles.filter(k => seleccion.has(k)).length;
  $('selectAll').checked = !!clavesVisibles.length && vis === clavesVisibles.length;
  $('selectAll').indeterminate = vis > 0 && vis < clavesVisibles.length;
  $('selectAll').disabled = datos.bloqueado || !clavesVisibles.length;
  $('lockNote').hidden = !datos.bloqueado;
}

async function render() {
  datos = await cargar();
  // La selección solo guarda productos que siguen en la lista.
  for (const k of [...seleccion]) if (!datos.claves.has(k)) seleccion.delete(k);
  renderResumen();
  renderFiltros();
  renderFilas();
  renderFuera();
  $('download').disabled = !datos.total;
  if (!cola.detenida && porBuscar().length) buscarVariantes();
}

// ---------- quitar productos ----------

// Confirmación en la página: resuelve "solo", "familia" o "cancelar".
function preguntar(texto, botonSolo, botonFamilia) {
  $('confirmText').textContent = texto;
  $('confirmOnly').textContent = botonSolo;
  $('confirmFamily').textContent = botonFamilia || '';
  $('confirmFamily').hidden = !botonFamilia;
  $('confirmBox').hidden = false;
  $('confirmOnly').focus();
  return new Promise(resolve => {
    const fin = valor => {
      $('confirmBox').hidden = true;
      for (const [id, f] of handlers) $(id).removeEventListener('click', f);
      document.removeEventListener('keydown', esc);
      resolve(valor);
    };
    const handlers = [['confirmOnly', () => fin('solo')], ['confirmFamily', () => fin('familia')], ['confirmCancel', () => fin('cancelar')]];
    const esc = e => { if (e.key === 'Escape') fin('cancelar'); };
    for (const [id, f] of handlers) $(id).addEventListener('click', f);
    document.addEventListener('keydown', esc);
  });
}

const etiqueta = p => `«${p.nombre || '(sin nombre)'}» (${p.asin || 'sin SKU'})`;

// ¿El producto representa una familia en el Excel? (Amazon de grupos con variantes,
// Kate Spade siempre; ver familias.js). El sistema crea toda la familia desde él.
function representaFamilia(p) {
  const Fam = globalThis.__cfFamilias;
  return !!p.familia && datos.filas.some(f => f.producto.clave === p.clave)
    && Fam.agrupa(Fam.porEcomerce(config), p, p.conVariaciones);
}

// Aviso de lo que se pierde al quitar al representante de una familia. Los otros de
// la familia que se omitieron al extraer no están en la lista: no entran en su lugar.
function avisoFamilia(p) {
  if (!representaFamilia(p)) return '';
  const tam = p.familiaTam > 1 ? ` (${p.familiaTam} ${p.ecomerce === 'Kate Spade' ? 'estilos' : 'variantes'})` : '';
  const omit = p.familiaOmitidos ? ` Al extraer se omitieron ${plural(p.familiaOmitidos, 'producto')} de esta familia; no están en la lista.` : '';
  return `Representa a su familia${tam}: el sistema crea todas sus variantes a partir de este producto.${omit} Si lo quitas, no se creará ninguna variante de esa familia.`;
}

// Pide confirmación y quita. Si un elegido representa una familia cuyos otros
// productos hoy no van al Excel (entrarían en su lugar), ofrece además quitar la
// familia completa.
async function pedirQuitar(claves) {
  claves = [...new Set(claves)].filter(Boolean);
  if (!claves.length || datos.bloqueado) return;
  const elegidos = new Set(claves);
  const X = config.xlsx || {};
  const afectadas = datos.filas.map(f => f.producto)
    .filter(p => elegidos.has(p.clave))
    .map(p => ({ p, hermanos: (datos.omitidosPorFamilia.get(familiaDe(p, X)) || []).filter(h => !elegidos.has(h.clave)) }))
    .filter(a => a.hermanos.length);
  const extra = afectadas.flatMap(a => a.hermanos.map(h => h.clave));
  let texto;
  let solo;
  let familia = '';
  if (claves.length === 1 && !afectadas.length) {
    const p = [...datos.filas.map(f => f.producto), ...datos.fuera.map(f => f.p)].find(x => x.clave === claves[0]);
    const fam = p ? avisoFamilia(p) : '';
    texto = `¿Quitar ${p ? etiqueta(p) : 'este producto'} de la lista?${fam ? `\n\n${fam}` : ''}\n\nPodrás deshacerlo justo después.`;
    solo = 'Quitar';
  } else if (claves.length === 1) {
    const { p, hermanos } = afectadas[0];
    texto = `${etiqueta(p)} representa una familia: ${plural(hermanos.length, 'producto')} más de la misma familia ${hermanos.length === 1 ? 'está' : 'están'} en la lista pero no ${hermanos.length === 1 ? 'va' : 'van'} al Excel.\n\nSi lo quitas solo a él, entra ${etiqueta(hermanos[0])} en su lugar.`;
    solo = 'Quitar solo este';
    familia = `Quitar la familia completa (${hermanos.length + 1})`;
  } else {
    texto = `¿Quitar ${plural(claves.length, 'producto')} de la lista?`;
    // Representantes sin otro producto de su familia en la lista: esas familias no se crearán.
    const solos = datos.filas.map(f => f.producto)
      .filter(p => elegidos.has(p.clave) && representaFamilia(p) && !afectadas.some(a => a.p.clave === p.clave)).length;
    if (solos) texto += `\n\n${plural(solos, 'de ellos representa', 'de ellos representan')} a su familia: el sistema crea todas las variantes a partir de ese producto, así que ${solos === 1 ? 'esa familia no se creará' : 'esas familias no se crearán'}.`;
    if (afectadas.length) {
      texto += `\n\n${plural(afectadas.length, 'de ellos representa', 'de ellos representan')} una familia con otros productos que hoy no van al Excel (${extra.length}). Si los quitas solo a ellos, esos entran en su lugar.`;
      familia = `Quitar también sus familias (+${extra.length})`;
    }
    solo = afectadas.length ? 'Quitar solo los elegidos' : `Quitar ${claves.length}`;
  }
  const eleccion = await preguntar(texto, solo, familia);
  if (eleccion === 'cancelar') return;
  return quitar(eleccion === 'familia' ? [...claves, ...extra] : claves);
}

function avisoDeshacer(texto, error = false, conDeshacer = !error) {
  $('undoBar').hidden = false;
  $('undoBar').className = `undo${error ? ' error' : ''}`;
  $('undoText').textContent = texto;
  $('undoBtn').hidden = !conDeshacer;
}

async function quitar(claves) {
  const r = await chrome.runtime.sendMessage({ type: 'quitarProductos', claves }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudieron quitar los productos.', true);
  for (const k of claves) seleccion.delete(k);
  ultimoQuitado = r.quitados || [];
  const n = ultimoQuitado.length;
  avisoDeshacer(n ? `Se ${n === 1 ? 'quitó' : 'quitaron'} ${plural(n, 'producto')} de la lista.` : 'Esos productos ya no estaban en la lista.', false, n > 0);
  await render();
}

$('undoBtn').addEventListener('click', async () => {
  if (!ultimoQuitado?.length) return;
  const r = await chrome.runtime.sendMessage({ type: 'restaurarProductos', quitados: ultimoQuitado }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo deshacer.', true);
  const faltan = ultimoQuitado.length - r.restaurados;
  ultimoQuitado = null;
  avisoDeshacer(`${r.restaurados === 1 ? 'Volvió 1 producto' : `Volvieron ${r.restaurados} productos`} a la lista.${faltan ? ` ${plural(faltan, 'producto')} no: ya ${faltan === 1 ? 'estaba' : 'estaban'} de nuevo en la lista o su grupo se eliminó.` : ''}`, false, false);
  await render();
});

$('removeSelected').addEventListener('click', () => pedirQuitar([...seleccion]));
$('selectAll').addEventListener('change', () => {
  for (const k of clavesVisibles) {
    if ($('selectAll').checked) seleccion.add(k);
    else seleccion.delete(k);
  }
  renderFilas();
});

// ---------- descarga ----------

function showStatus(msg, cls = '') {
  $('status').hidden = false;
  $('status').className = cls;
  $('status').textContent = msg;
}

function updateNamePreview() {
  $('exportNamePreview').textContent = `Se guardará como: ${exportFileName($('exportName').value, config?.xlsx?.filenamePrefix || DEFAULT_PREFIX)}`;
}

$('downloadForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('download').disabled = true;
  try {
    const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
    const { items } = await getCachedCategories();
    const r = await descargarLista(collected, groups, items, $('exportName').value);
    showStatus(r.encolada ? encoladaTxt(r.encolada, 'esta pestaña') : exportSummary(r), r.encolada ? '' : 'success');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'No se pudo generar el Excel.', 'error');
  } finally {
    $('download').disabled = !datos?.total;
  }
});

// ---------- inicio ----------

for (const id of ['groupFilter', 'siteFilter', 'warnFilter']) $(id).addEventListener('change', renderFilas);
$('search').addEventListener('input', renderFilas);
$('exportName').addEventListener('input', updateNamePreview);

// Cambios en la lista, o una extracción que empieza o termina: se vuelve a calcular
// (agrupados). El avance de la extracción en curso no redibuja la tabla.
let espera = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const j = changes.jobs;
  const cambioJob = j && (j.oldValue?.actual?.id || null) !== (j.newValue?.actual?.id || null);
  if (!cambioJob && !changes.collected && !changes.groups) return;
  clearTimeout(espera);
  espera = setTimeout(() => render().catch(console.error), 400);
});

render().then(updateNamePreview).catch(error => {
  console.error(error);
  showStatus(`No se pudo armar la vista previa: ${error.message}`, 'error');
});
