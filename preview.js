// Vista previa del Excel (preview.html, en una pestaña): las mismas filas que tendrá
// el archivo, calculadas con filasExcel (xlsx.js) sobre la lista actual, mostradas
// como tarjetas por grupo para quien revisa el contenido (las columnas del Excel, con
// "Ver datos técnicos"), con sus avisos y los productos que no irán al Excel. Permite
// quitar productos de la lista (Quitar o las casillas de producto y grupo), con Deshacer; lo hace
// el service worker (quitarProductos).
// Se actualiza sola cuando cambia la lista (por ejemplo, durante una extracción).
// Todo el contenido se arma con textContent: los datos vienen de páginas externas.
import { getConfig, extensionVersion } from './config.js';
import { getHistory } from './history.js';
import { syncGroups, sortedGroups, productsForExport } from './groups.js';
import { filasExcel } from './xlsx.js';
import { sinFamilia } from './jobs.js';
import { getCachedCategories } from './categories.js';
import { sitesOf, siteIcon, DEFAULT_ICON } from './sites.js';
import { exportSummary, exportFileName, DEFAULT_PREFIX } from './export.js';
import { descargarLista, encoladaTxt } from './descarga.js';
import { elegirCategoria } from './selector-categoria.js';
import { $, el, plural, showStatus } from './dom.js';
import './familias.js';

const esHttps = u => /^https:\/\//i.test(u || '');

// Grupo pedido desde el popup ("Ver sus productos en la vista previa").
const grupoInicial = new URLSearchParams(location.search).get('grupo') || '';
let datos = null;
let config = null;
// Claves elegidas con las casillas y lo quitado en el último cambio (para Deshacer).
const seleccion = new Set();
// Último cambio, para Deshacer: { tipo: 'quitar', datos: quitados } o { tipo: 'categoria', datos: previos }.
let ultimoCambio = null;
// Productos con el desplegable de variantes abierto (por clave) y variantes leídas de
// la página del producto (Sephora, Michael Kors, o extraídos antes de la v1.13.0): { variantes,
// dims } | { cargando } | { error }. Las leídas se guardan en storage.local
// (variantesLeidas) y se recuerdan 7 días.
const abiertos = new Set();
const cargadas = new Map();
// Variantes con muchas tallas o colores: color con sus tallas abiertas (por producto) y
// productos con todas las miniaturas a la vista. Hasta MAX_CHIPS tallas van en chips; con
// más, un resumen y "Ver tallas". Se muestran MAX_MINIS miniaturas y "Ver los N colores".
const tallaAbierta = new Map();
const todosColores = new Set();
const MAX_CHIPS = 6;
const MAX_MINIS = 14;
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

// Pestaña elegida (todos, revisar, fuera) y el interruptor
// "Ver datos técnicos" (se recuerda en este navegador).
let pestana = 'todos';
const TECNICO = 'cfVistaTecnica';
let tecnico = false;
try { tecnico = localStorage.getItem(TECNICO) === '1'; } catch { /* sin almacenamiento */ }
// Vista de cada grupo (por nombre): comprimido (solo la cabecera), resumido (los
// primeros MAX_RESUMIDO productos; por defecto) o completo. Se recuerda en este navegador.
const VISTAS = 'cfVistaGrupos';
const MAX_RESUMIDO = 3;
let vistaGrupos = {};
try { vistaGrupos = JSON.parse(localStorage.getItem(VISTAS) || '{}') || {}; } catch { /* sin almacenamiento */ }
const vistaDe = nombre => (['comprimido', 'resumido', 'completo'].includes(vistaGrupos[nombre]) ? vistaGrupos[nombre] : 'resumido');
// Al cambiar la vista de un grupo se cierran sus desplegables de variantes y tallas
// (y vuelve a verse solo una parte de los colores); los de otros grupos no cambian.
function ponerVista(nombres, vista) {
  const grupos = new Set(nombres);
  for (const p of [...datos.filas.map(f => f.producto), ...datos.fuera.map(x => x.p)]) {
    if (!grupos.has(p.grupo)) continue;
    abiertos.delete(p.clave);
    tallaAbierta.delete(p.clave);
    todosColores.delete(p.clave);
  }
  for (const n of nombres) vistaGrupos[n] = vista;
  try { localStorage.setItem(VISTAS, JSON.stringify(vistaGrupos)); } catch { /* sin almacenamiento */ }
  renderFilas();
}

// Avisos en palabras sencillas, con lo que conviene hacer. El texto original
// (ref_duplicado) se ve en los datos técnicos.
function avisoClaro(a) {
  const t = a.txt;
  const m = t.match(/^Posible variante: filas? (.+)$/);
  if (m) {
    const nombres = m[1].split(/,\s*/).map(n => datos.filas.find(f => f.fila === Number(n))).filter(Boolean)
      .map(f => `«${f.producto.nombre || f.producto.asin}» (N° ${f.fila - 1})`);
    return { titulo: 'Mismo nombre que otro producto', ayuda: `${nombres.join(', ') || `Fila ${m[1]}`}. Si es otro modelo, déjalo; si es el mismo producto, quita uno.` };
  }
  if (t === 'Familia sin verificar') return { titulo: 'No se pudo comprobar su familia', ayuda: 'Podría ser variante de otro producto de la lista.' };
  if (t === 'Familia por verificar al descargar') return { titulo: 'Su familia se comprobará al descargar', ayuda: 'Si repite una familia ya incluida, saldrá del Excel.' };
  if (t === 'Sin categoría') return { titulo: 'Falta la categoría', ayuda: 'Elígela en la plantilla después de descargar.' };
  if (t.startsWith('Condición: ')) return { titulo: `Es ${t.slice(11).toLowerCase()}`, ayuda: 'No es un producto nuevo.' };
  if (a.bad) return { titulo: 'Código con guion', ayuda: 'El sistema corta el código en el primer "-": revisa este producto.', bad: true };
  return { titulo: t, ayuda: '' };
}

function iconoDeSitio(ecomerce) {
  const site = sitesOf(config).find(s => (s.ecomerce || s.name) === ecomerce);
  const img = el('img', { alt: '' });
  img.onerror = () => { img.onerror = null; img.src = DEFAULT_ICON[32]; };
  img.src = siteIcon(site)?.[32] || DEFAULT_ICON[32];
  return img;
}

const sitio = ecomerce => el('span', { className: 'site' }, iconoDeSitio(ecomerce), ecomerce);

// Las <img> se reutilizan entre dibujados (renderFilas rehace la lista): una imagen
// nueva, aun en caché, se ve vacía un instante y la página parpadea.
const imagenes = new Map();
let pasada = 0;

// Foto del producto o de una variante (cuadro gris si no hay).
function foto(src, link) {
  const box = el('div', { className: 'foto' });
  if (esHttps(src)) {
    let img = imagenes.get(src);
    // La misma imagen dos veces en un dibujado: la segunda es otra <img>.
    if (!img || img.dataset.pasada === String(pasada)) {
      // referrerPolicy antes que src: cambiarlo después vuelve a pedir la imagen.
      img = el('img', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src });
      const esta = img;
      img.onerror = () => { if (imagenes.get(src) === esta) imagenes.delete(src); esta.replaceWith('Sin imagen'); };
      if (!imagenes.has(src)) imagenes.set(src, img);
    }
    img.dataset.pasada = pasada;
    box.append(img);
  } else box.append('Sin imagen');
  if (!link) return box;
  return el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: link }, box);
}

// Tarjeta del resumen; con `accion`, se puede pulsar (lleva a una pestaña).
function tarjeta(clase, k, v, s, accion) {
  const c = el('div', { className: `stat ${clase}` },
    el('div', { className: 'k', textContent: k }), el('span', { className: 'cifra', textContent: v }), s ? el('div', { className: 's', textContent: s }) : null);
  if (accion) {
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    c.addEventListener('click', accion);
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accion(); } });
  }
  return c;
}

const filasConAvisos = () => datos.filas.map(f => [f, avisosDe(f)]);

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
  const revisar = filasConAvisos().filter(([, a]) => a.length).length;
  const ex = datos.extrayendo;

  // Estado general en palabras: lo primero que se lee.
  const estado = !total ? ['info', 'La lista está vacía', 'Extrae productos desde el popup de la extensión.']
    : ex ? ['info', `${ex.tipo === 'exportar' ? 'Exportación' : 'Extracción'} en curso`, 'Esta página se actualiza sola.']
      : revisar ? ['warn', `${plural(revisar, 'producto')} para revisar`, 'Puedes descargar igual: se subirán tal cual.']
        : ['', 'Todo listo para descargar', 'Ningún producto tiene avisos.'];
  const cards = [
    tarjeta(`estado ${estado[0]}`, 'Estado', estado[1], estado[2], revisar && !ex ? () => elegirPestana('revisar') : null),
    tarjeta('', 'Productos en el Excel', r.filas, `de ${plural(total, 'producto')} en la lista`, () => elegirPestana('todos')),
  ];
  if (variantes) cards.push(tarjeta('c-orange', 'Variantes que creará el sistema', variantes, `a partir de ${plural(reps.length + seph.length, 'producto')} con variantes`));
  else if (buscando) cards.push(tarjeta('c-orange', 'Variantes que creará el sistema', '…', `Buscando las variantes de ${plural(buscando, 'producto')}`));
  cards.push(tarjeta('c-red', 'No irán al Excel', fuera.length, fuera.length ? 'repetidos o sin código' : 'ninguno', fuera.length ? () => elegirPestana('fuera') : null));
  $('hero').replaceChildren(...cards);

  // Detalle de las cifras (solo las que no son cero).
  const chips = [
    ['', 'Familias en el Excel', reps.length],
    ['', 'Omitidos al extraer (misma familia)', omitidosAlExtraer],
    ['', 'Omitidos por familia repetida', familia],
    ['bad', 'Sin SKU (no van)', r.omitidos],
    ['warn', 'Familia por verificar', pendientes.size],
    ['warn', 'Familia sin verificar', r.sinFamilia],
    ['warn', 'Sin categoría', r.sinCategoria],
    ['warn', 'Posibles variantes repetidas', r.duplicados],
    ['warn', 'Reacondicionado', r.reacondicionados],
    ['bad', 'SKU con guion', r.conGuion],
  ].filter(([, , n]) => n);
  $('chips').replaceChildren(...chips.map(([cls, txt, n]) => el('span', { className: `chip ${cls}` }, `${txt}: `, el('b', { textContent: n }))));
  $('pendingNote').hidden = !pendientes.size;
  $('pendingNote').textContent = pendientes.size
    ? `Al descargar se verificará la familia de ${plural(pendientes.size, 'producto')} (unos ${Math.max(1, Math.round(pendientes.size * 3.5 / 60))} min). Los que repitan una familia ya incluida saldrán del Excel, así que puede tener menos productos que los que se ven aquí.`
    : '';
  $('live').hidden = !ex;
  $('live').textContent = ex ? `${ex.tipo === 'exportar' ? 'Exportación' : 'Extracción'} en curso: esta página se actualiza sola` : '';
  $('subtitle').textContent = `${plural(total, 'producto')} en ${plural(datos.grupos.length, 'grupo')} · v${extensionVersion()}`;
  $('nTodos').textContent = datos.filas.length;
  $('nRevisar').textContent = revisar;
  $('nFuera').textContent = fuera.length;
  $('tabFuera').hidden = !fuera.length;
  if (!fuera.length && pestana === 'fuera') pestana = 'todos';
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
  const sitios = [...new Set(datos.filas.map(f => f.sitio))];
  setOptions($('siteFilter'), [['', 'Todos los sitios'], ...sitios.map(s => [s, s])], '');
  $('siteFilter').hidden = sitios.length < 2;
  // Con un sitio elegido, solo los grupos que tienen productos de ese sitio.
  const sitio = $('siteFilter').value;
  const conSitio = new Set([
    ...datos.filas.filter(f => f.sitio === sitio).map(f => f.ref.grupo),
    ...datos.fuera.filter(x => (x.p.ecomerce || '') === sitio).map(x => x.p.grupo),
  ]);
  const grupos = datos.grupos.filter(g => !sitio || conSitio.has(g.nombre));
  setOptions($('groupFilter'), [['', 'Todos los grupos'], ...grupos.map(g => [g.nombre, g.nombre])], grupoIni);
}

const coincide = (q, valores) => !q || valores.some(v => String(v || '').toLowerCase().includes(q));

function visible(f) {
  const q = $('search').value.trim().toLowerCase();
  const p = f.producto;
  if ($('groupFilter').value && f.ref.grupo !== $('groupFilter').value) return false;
  if ($('siteFilter').value && f.sitio !== $('siteFilter').value) return false;
  const deVariantes = (Array.isArray(p.variantes) && tieneVariantes(p) ? p.variantes : []).flatMap(v => [v.sku, ...(v.atributos || [])]);
  return coincide(q, [p.nombre, p.marca, p.asin, p.link, p.variante, ...deVariantes]);
}

// Productos que no irán al Excel, con los mismos filtros.
function visibleFuera({ p }) {
  const q = $('search').value.trim().toLowerCase();
  const grupo = datos.grupos.find(g => g.id === p.grupo)?.nombre || p.grupo || '';
  if ($('groupFilter').value && grupo !== $('groupFilter').value) return false;
  if ($('siteFilter').value && (p.ecomerce || '') !== $('siteFilter').value) return false;
  return coincide(q, [p.nombre, p.marca, p.asin, p.link]);
}

// Casilla de selección y botón Quitar de un producto.
function casilla(p, card) {
  const nombre = p.nombre || p.asin || 'este producto';
  const check = el('input', { type: 'checkbox', className: 'sel', checked: seleccion.has(p.clave), disabled: datos.bloqueado });
  check.setAttribute('aria-label', `Seleccionar ${nombre}`);
  check.addEventListener('change', () => {
    if (check.checked) seleccion.add(p.clave);
    else seleccion.delete(p.clave);
    renderFilas();
  });
  card.classList.toggle('selected', check.checked);
  return check;
}

function botonQuitar(p) {
  const b = el('button', { type: 'button', className: 'quitar', textContent: 'Quitar', title: 'Quitar de la lista (se puede deshacer)', disabled: datos.bloqueado });
  b.setAttribute('aria-label', `Quitar ${p.nombre || p.asin || 'este producto'} de la lista`);
  b.addEventListener('click', () => pedirQuitar([p.clave]));
  return b;
}

const enlace = (href, texto) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', title: href, textContent: texto });

// Botón del desplegable de variantes.
function botonVariantes(p) {
  const abierto = abiertos.has(p.clave);
  const n = variantesDe(p)?.vs.length || p.familiaTam || 0;
  const unidad = p.ecomerce === 'Kate Spade' && !buscaVariantes(p) ? 'estilo' : 'variante';
  const btn = el('button', { type: 'button', className: 'toggle', textContent: abierto ? '▾ Ocultar variantes' : `▸ Ver ${n > 1 ? plural(n, unidad) : 'variantes'}` });
  btn.setAttribute('aria-expanded', String(abierto));
  btn.addEventListener('click', () => {
    if (abierto) abiertos.delete(p.clave);
    else abiertos.add(p.clave);
    renderFilas();
  });
  return btn;
}

// Familia del producto (Amazon con variantes, Kate Spade) o variantes leídas de su
// página (Sephora, Michael Kors…): etiquetas junto a la categoría. Solo informativo.
// Los extraídos antes de la v1.12.0 no traen esas cifras.
function infoFamilia(p) {
  const nodos = [];
  const pill = (texto, cls = '', title = '') => el('span', { className: `pill ${cls}`, textContent: texto, title });
  // Con búsqueda automática (Sephora, Michael Kors, Marc Jacobs, Kate Spade) se muestra
  // lo leído de la página; si no, las cifras guardadas al extraer (Amazon).
  const familia = representaFamilia(p) && !buscaVariantes(p);
  if (!familia && !buscaVariantes(p)) return nodos;
  if (familia) {
    if (p.familiaTam === 1) nodos.push(pill('Sin variantes'));
    else if (!p.familiaTam) nodos.push(pill('Representa su familia', '', 'Extraído antes de la v1.12.0, o su familia ya se conocía sin descargar su página'));
  } else {
    const c = cargadas.get(p.clave);
    const boton = (texto, accion) => {
      const b = el('button', { type: 'button', className: 'toggle', textContent: texto });
      b.addEventListener('click', accion);
      return b;
    };
    if (c?.variantes) {
      if (c.variantes.length <= 1) nodos.push(pill('Sin variantes'));
      // Sin otras variantes pero la página ofrece tamaños o colores de otro modelo
      // (Marc Jacobs: SMALL y LARGE son estilos distintos): se dice cuál es.
      if (c.variantes.length <= 1 && c.aparte?.length) {
        const pids = [...new Set(c.aparte.map(a => a.pid))];
        const de = (tipo, uno, varios) => { const l = c.aparte.filter(a => a.tipo === tipo).map(a => a.nombre); return l.length ? `${l.length === 1 ? uno : varios} ${l.join(', ')}` : ''; };
        const que = [de('talla', 'tamaño', 'tamaños'), de('color', 'color', 'colores')].filter(Boolean).join(' · ');
        nodos.push(el('span', { className: 'muted', textContent: `Otro modelo (${pids.join(', ')}): ${que}` }));
      }
    } else if (c?.error) {
      nodos.push(el('span', { className: 'err', textContent: 'No se pudieron leer sus variantes', title: c.error }),
        boton('Reintentar', () => { cargadas.delete(p.clave); cola.detenida = false; renderFilas(); buscarVariantes(); }));
    } else if (cola.detenida && !cola.activa && !c) {
      nodos.push(el('span', { className: 'muted', textContent: 'Variantes sin leer' }),
        boton('Buscar variantes', () => { cola.detenida = false; buscarVariantes(); }));
    } else nodos.push(el('span', { className: 'muted', textContent: 'Buscando variantes…' }));
  }
  if (tieneVariantes(p)) nodos.push(botonVariantes(p));
  if (familia && p.familiaOmitidos) nodos.push(el('span', { className: 'muted', textContent: `${plural(p.familiaOmitidos, 'omitido')} al extraer (misma familia)` }));
  return nodos;
}

// Datos técnicos de un producto: su fila del Excel tal cual, como una hoja de cálculo
// (columnas del sistema en el orden de la plantilla; las vacías dicen por qué) y,
// aparte, las de referencia (ref_*) y datos que no van al Excel.
function datosTecnicos(f, avisos) {
  const p = f.producto;
  const vacia = por => el('span', { className: 'vacia', textContent: 'vacía', title: por });
  const valor = (col, v) => {
    if (col === 'link' && esHttps(v)) {
      const u = new URL(v);
      return enlace(u.href, `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}`);
    }
    if (v) return el('span', { textContent: v });
    if (col === 'sku') return vacia('El sistema saca el SKU del link');
    if (col === 'link') return vacia('El sistema usa el sku');
    if (col === 'codigo_categoria' || col === 'Buscar categoria') return vacia('Se elige en la plantilla');
    return vacia('');
  };
  const cols = Object.keys(f.celdas);
  const tabla = el('table', {},
    el('thead', {}, el('tr', {}, el('th', { className: 'n', textContent: '' }), ...cols.map(c => el('th', { textContent: c })))),
    el('tbody', {}, el('tr', {}, el('td', { className: 'n', textContent: f.fila }), ...cols.map(c => el('td', { className: c === 'link' ? 'link' : '' }, valor(c, f.celdas[c]))))));
  // Referencia: no la lee el sistema.
  const ref = [
    ['ref_grupo', f.ref.grupo],
    ['ref_duplicado', f.ref.duplicado],
    [p.ecomerce === 'Sephora' ? 'skuId (en el link)' : !f.celdas.sku ? 'SKU (en el link)' : '', !f.celdas.sku ? f.ref.variante || p.asin : ''],
    ['familia', p.familia],
    ['avisos', avisos.map(a => a.txt).filter(t => t !== f.ref.duplicado).join(' · ')],
  ].filter(([k, v]) => k && v);
  return el('div', { className: 'tec' },
    el('div', { className: 'tec-t' }, el('span', { className: 'xl', textContent: 'X' }), `Fila ${f.fila} del Excel`, el('span', { className: 'muted', textContent: ` · producto N° ${f.fila - 1} · columnas que lee el sistema` })),
    el('div', { className: 'hoja' }, tabla),
    ref.length ? el('div', { className: 'refs' }, el('span', { className: 'muted', textContent: 'Solo referencia:' }),
      ...ref.map(([k, v]) => el('span', { className: 'ref' }, el('b', { textContent: k }), ` ${v}`))) : null,
  );
}

// Tarjeta de un producto que va al Excel.
function tarjetaProducto(f, avisos) {
  const p = f.producto;
  const card = el('article', { className: `prod con-sel${avisos.length ? ' attn' : ''}` });
  card.append(casilla(p, card));
  const abrir = esHttps(f.celdas.link) ? f.celdas.link : esHttps(p.link) ? p.link : '';
  card.append(foto(p.imagen, abrir));

  const info = el('div', { className: 'info' });
  info.append(el('div', { className: 'nombre', textContent: p.nombre || '(sin nombre)' }));
  const meta = el('div', { className: 'meta' }, sitio(f.sitio));
  if (p.marca) meta.append(el('span', { textContent: p.marca }));
  if (f.ref.precio !== '') meta.append(el('span', { className: 'precio', textContent: `$${Number(f.ref.precio).toFixed(2)}` }));
  meta.append(el('span', { textContent: f.celdas.condicion }));
  info.append(meta);

  const linea = el('div', { className: 'linea' });
  const bCat = f.celdas.codigo_categoria
    ? el('button', { type: 'button', className: 'cat', textContent: `${f.celdas['Buscar categoria'] || `Categoría ${f.celdas.codigo_categoria}`} ✎`, title: `${f.celdas.codigo_categoria} · Cambiar la categoría de este producto` })
    : el('button', { type: 'button', className: 'cat falta', textContent: 'Sin categoría · Asignar ✎', title: 'Asignar una categoría a este producto' });
  bCat.disabled = datos.bloqueado;
  bCat.addEventListener('click', () => categoriaProducto(p));
  linea.append(bCat);
  linea.append(avisos.length ? el('span', { className: 'pill warn', textContent: '⚠ Revisar' }) : el('span', { className: 'pill on', textContent: '✓ Listo' }));
  linea.append(...infoFamilia(p));
  info.append(linea);
  if (avisos.length) {
    const ul = el('ul', { className: 'avisos' });
    for (const a of avisos.map(avisoClaro)) ul.append(el('li', { className: a.bad ? 'bad' : '' }, el('b', { textContent: `${a.titulo}.` }), a.ayuda ? ` ${a.ayuda}` : ''));
    info.append(ul);
  }
  card.append(info);

  const lado = el('div', { className: 'lado' });
  if (abrir) lado.append(enlace(abrir, `Ver en ${f.sitio} ↗`));
  lado.append(botonQuitar(p));
  card.append(lado);

  if (tecnico) card.append(datosTecnicos(f, avisos));
  if (abiertos.has(p.clave) && tieneVariantes(p)) card.append(panelVariantes(f));
  return card;
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

// Mensaje dentro del desplegable (cargando, error, sin datos).
const mensaje = (...hijos) => el('div', { className: 'msg' }, ...hijos);

// Botón que lee las variantes de la página del producto, con el error anterior si hubo.
function mensajeCargar(p, texto, nota) {
  const c = cargadas.get(p.clave);
  if (c?.cargando) return mensaje(el('span', { className: 'muted', textContent: 'Cargando variantes…' }));
  const b = el('button', { type: 'button', className: 'toggle', textContent: c?.error ? 'Reintentar' : texto });
  b.addEventListener('click', () => cargarVariantes(p));
  return mensaje(
    c?.error ? el('div', { className: 'err', textContent: `No se pudieron cargar: ${c.error}.` }) : null,
    el('div', { className: 'muted', textContent: nota }),
    b,
  );
}

// Desplegable con las variantes que el sistema crea desde el producto, en miniaturas.
// Grupo, categoría, opciones y condición son las del producto: el sistema las aplica igual.
// Con dimensiones que no cambian la imagen (ropa: talla), una miniatura por color/modelo
// con sus tallas en chips; si no, una por variante.
function panelVariantes(f) {
  const p = f.producto;
  const panel = el('div', { className: 'vars' });
  const d = variantesDe(p);
  if (!d) {
    panel.append(mensajeCargar(p, 'Cargar variantes', 'Se extrajo antes de la v1.13.0: sus variantes no se guardaron. Se pueden leer de la página del producto (una descarga).'));
    return panel;
  }
  const { vs, dims } = d;
  if (!vs.length) {
    panel.append(mensaje(el('span', { className: 'muted', textContent: 'La página del producto no trae datos de sus variantes.' })));
    return panel;
  }

  const X = config.xlsx || {};
  // Productos de la lista de la misma familia ("No irán al Excel"): traen nombre y precio.
  const deLista = new Map((datos.omitidosPorFamilia.get(familiaDe(p, X)) || []).map(h => [String(h.asin).toUpperCase(), h]));
  let origen = 'https://www.amazon.com';
  try { if (esHttps(p.link)) origen = new URL(p.link).origin; } catch { /* link inválido */ }
  // La variante que va al Excel: el ASIN o estilo; en Sephora, el skuId del link.
  const idExcel = String((p.ecomerce === 'Sephora' ? p.variante : p.asin) || '').toUpperCase();
  const propio = sku => !!idExcel && String(sku || '').toUpperCase() === idExcel;
  // Amazon: /dp/ASIN en el mismo dominio del producto; Kate Spade trae su link.
  const linkDe = v => (esHttps(v.link) ? v.link : /^[A-Z0-9]{10}$/i.test(v.sku || '') && p.ecomerce !== 'Kate Spade' ? `${origen}/dp/${v.sku}` : '');

  // Miniatura de una variante: imagen, nombre propio (si lo trae), atributos, extra
  // (nodo bajo los atributos), precio, sku y familia (en datos técnicos), link y si es
  // la que va al Excel.
  const mini = ({ imagen, nombre, atributos, extra, precio, sku, familia, link, este }) => {
    const v = el('div', { className: `v${este ? ' este' : ''}` });
    v.append(foto(imagen, link));
    if (nombre) v.append(el('div', { textContent: nombre }));
    if (atributos) v.append(el('div', { className: 'attrs', textContent: atributos }));
    if (!nombre && !atributos) v.append(el('div', { className: 'mono', textContent: sku }));
    if (extra) v.append(extra);
    if (Number.isFinite(precio)) v.append(el('div', { className: 'precio', textContent: `$${precio.toFixed(2)}` }));
    if (tecnico) v.append(el('div', {}, el('span', { className: 'code', textContent: sku, title: familia })));
    if (este) v.append(el('span', { className: 'badge', textContent: 'Va al Excel' }));
    return v;
  };

  const notas = [];
  // Aviso al final (Marc Jacobs: colores de otro modelo que la página también muestra).
  const nota = d.nota || cargadas.get(p.clave)?.nota;
  // Variantes de Amazon guardadas sin dimensiones (versión de prueba): se pueden releer.
  if (dims === null && vs.some(v => v.atributos?.length > 1) && p.ecomerce !== 'Kate Spade') {
    notas.push(mensajeCargar(p, 'Actualizar variantes', 'Para agruparlas por color o modelo hay que volver a leer la página del producto (una descarga).'));
  }

  const n = vs[0].atributos?.length || 0;
  const usables = Array.isArray(dims) && dims.length === n && vs.every(v => v.atributos?.length === n);
  const visuales = usables ? dims.map((x, i) => (x.visual ? i : -1)).filter(i => i >= 0) : [];
  const otras = usables ? dims.map((x, i) => (x.visual ? -1 : i)).filter(i => i >= 0) : [];
  let cuantas = vs.length;
  // Nombre de lo que agrupa cada miniatura (color, estilo…; ver nombreDim).
  let que = { s: 'variante', p: 'variantes', f: true, detalle: '' };
  // Miniaturas ({ nodo, este }; con muchas, solo las primeras), líneas bajo el título y
  // detalle de las tallas del color abierto.
  const items = [];
  const extras = [];
  let detalle = null;

  if (!visuales.length || !otras.length) {
    // Una miniatura por variante (todas cambian la imagen, o una sola dimensión).
    for (const v of vs) {
      const h = deLista.get(String(v.sku).toUpperCase());
      items.push({
        este: propio(v.sku),
        nodo: mini({
          imagen: [v.imagen, h?.imagen].find(esHttps),
          nombre: h?.nombre || v.nombre,
          atributos: (v.atributos || []).join(' · '),
          extra: v.tamano ? el('div', { className: 'muted', textContent: v.tamano }) : null,
          precio: Number.isFinite(v.precio) ? v.precio : parseFloat(h?.precio),
          sku: String(v.sku || ''),
          familia: propio(v.sku) ? 'Representa la familia' : `Variante de ${p.asin}`,
          link: linkDe(v),
          este: propio(v.sku),
        }),
      });
    }
  } else {
    // Agrupadas por las dimensiones visuales (color), en el orden guardado (el de la página).
    const grupos = new Map();
    for (const v of vs) {
      const k = visuales.map(i => v.atributos[i]).join(' · ');
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    const nombreVisual = visuales.map(i => dims[i].nombre).join(' / ');
    const nombreOtras = otras.map(i => dims[i].nombre).join(' / ');
    cuantas = grupos.size;
    que = nombreDim(visuales.map(i => dims[i].nombre));
    // Lo que cambia dentro de cada miniatura (tallas, capacidades…).
    const tn = nombreDim(otras.map(i => dims[i].nombre));
    const Tn = tn.p[0].toUpperCase() + tn.p.slice(1);
    // El color del link del Excel, si lo trae: Michael Kors dwvar_<ID>_color=0001,
    // Marc Jacobs …/<ID>-002.html.
    const idLimpio = String(p.asin || '').replace(/[^A-Za-z0-9]/g, '');
    const colorExcel = p.ecomerce === 'Michael Kors'
      ? (String(p.link || '').match(new RegExp(`dwvar_${idLimpio}_color=(\\d{4})`, 'i')) || [])[1]
      : p.ecomerce === 'Marc Jacobs'
        ? (String(p.link || '').split('?')[0].match(new RegExp(`/${idLimpio}-([A-Za-z0-9]+)\\.html$`, 'i')) || [])[1]
        : '';

    // Tallas: texto de cada variante, orden de todas (une el de cada color) y, si son de
    // dos medidas (pantalones: "29W x 30L", o dos dimensiones), sus ejes.
    const talla = v => otras.map(i => v.atributos[i]).join(' · ') || v.sku;
    const listas = [...grupos.values()];
    const orden = ordenUnido(listas.map(l => l.map(talla)));
    const doble = otras.length === 2 ? v => [v.atributos[otras[0]], v.atributos[otras[1]]]
      : vs.every(v => /^.+?\s+x\s+.+$/i.test(talla(v))) ? v => talla(v).match(/^(.+?)\s+x\s+(.+)$/i).slice(1, 3)
        : null;
    const ejes = doble && {
      fila: v => doble(v)[0],
      col: v => doble(v)[1],
      filas: ordenUnido(listas.map(l => l.map(v => doble(v)[0]))),
      cols: ordenUnido(listas.map(l => l.map(v => doble(v)[1]))),
    };
    const rangoDe = lista => {
      if (ejes) {
        const fs = ejes.filas.filter(r => lista.some(v => ejes.fila(v) === r));
        const cs = ejes.cols.filter(c => lista.some(v => ejes.col(v) === c));
        return `${extremos(fs)} · ${extremos(cs)}`;
      }
      const ts = orden.filter(t => lista.some(v => talla(v) === t));
      return ts.length > 1 ? `${ts[0]} a ${ts.at(-1)}` : ts[0] || '';
    };
    // Resumen de las tallas de un color, frente a todas las del producto.
    const resumenDe = lista => {
      const ts = lista.map(talla);
      const faltan = orden.filter(t => !ts.includes(t));
      if (!faltan.length) return `${tn.f ? 'Todas las' : 'Todos los'} ${tn.p} (${ts.length})`;
      // Dos medidas: el rango (los nombres de lo que falta serían largos); se ve en la tabla.
      if (faltan.length <= 3 && !ejes) return `${plural(ts.length, tn.s, tn.p)} · sin ${faltan.join(', ')}`;
      return `${plural(ts.length, tn.s, tn.p)} · ${rangoDe(lista)}`;
    };
    const chipDe = v => {
      const texto = talla(v);
      const link = linkDe(v);
      const chip = link
        ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: `${nombreOtras} ${texto}: ${v.sku}${v.agotada ? ' (agotada)' : ''}`, textContent: texto })
        : el('span', { title: `${v.sku}${v.agotada ? ' (agotada)' : ''}`, textContent: texto });
      if (propio(v.sku)) chip.className = 'on';
      if (v.agotada) chip.classList.add('agotada');
      return chip;
    };
    // Tabla de dos medidas de un color: filas (cintura) × columnas (largo) de todo el
    // producto; ● existe (abre esa variante), · no existe en ese color.
    const matriz = lista => {
      const tabla = el('table', { className: 'matriz' });
      tabla.append(el('thead', {}, el('tr', {}, el('th'), ...ejes.cols.map(c => el('th', { textContent: c })))));
      const cuerpo = el('tbody');
      for (const r of ejes.filas) {
        const tr = el('tr', {}, el('th', { textContent: r }));
        for (const c of ejes.cols) {
          const v = lista.find(x => ejes.fila(x) === r && ejes.col(x) === c);
          if (!v) {
            tr.append(el('td', { className: 'no', textContent: '·', title: `${r} x ${c}: no existe en ${que.f ? 'esta' : 'este'} ${que.s}` }));
            continue;
          }
          const link = linkDe(v);
          const titulo = `${r} x ${c}: ${v.sku}${v.agotada ? ' (agotada)' : ''}${propio(v.sku) ? ' · va al Excel' : ''}`;
          const td = el('td', { className: [propio(v.sku) ? 'on' : '', v.agotada ? 'agotada' : ''].filter(Boolean).join(' ') });
          td.append(link
            ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: titulo, textContent: '●' })
            : el('span', { title: titulo, textContent: '●' }));
          tr.append(td);
        }
        cuerpo.append(tr);
      }
      tabla.append(cuerpo);
      return el('div', { className: 'matriz-wrap' }, tabla);
    };

    const abierta = tallaAbierta.get(p.clave);
    for (const [k, lista] of grupos) {
      const este = lista.some(v => propio(v.sku)) || (!!colorExcel && lista.some(v => v.codigoColor === colorExcel));
      // Pocas tallas: en chips, como siempre. Muchas: resumen y "Ver tallas".
      let extra;
      if (lista.length <= MAX_CHIPS) {
        extra = el('div', { className: 'chips-talla', title: nombreOtras }, ...lista.map(chipDe));
      } else {
        const boton = el('button', { type: 'button', className: 'toggle', textContent: abierta === k ? `▾ Ocultar ${tn.p}` : `▸ Ver ${tn.p}` });
        boton.setAttribute('aria-expanded', String(abierta === k));
        boton.addEventListener('click', () => {
          if (abierta === k) tallaAbierta.delete(p.clave);
          // Un solo detalle de tallas abierto en toda la página.
          else { tallaAbierta.clear(); tallaAbierta.set(p.clave, k); }
          renderFilas();
        });
        const propia = lista.find(v => propio(v.sku));
        extra = el('div', {},
          // "36 tallas" y, debajo, el rango o lo que falta (la miniatura es angosta).
          ...resumenDe(lista).split(/ · (.*)/s).filter(Boolean).map(x => el('div', { className: 'resumen-tallas', textContent: x })),
          propia ? el('div', { className: 'resumen-tallas on', textContent: `Va al Excel: ${talla(propia)}` }) : null,
          boton);
      }
      const nodo = mini({
        // Un solo color sin imagen propia: la del producto (es el mismo color).
        imagen: lista.map(v => v.imagen).find(esHttps) || (grupos.size === 1 ? p.imagen : undefined),
        nombre: null,
        // Sin color en la página (solo tallas, p. ej. un abrigo de Kate Spade): no se
        // muestra el "—". En Amazon sí, porque la dimensión visual no siempre es el color.
        // (también "— (KP115)", guardado antes con el estilo de la familia).
        atributos: p.ecomerce !== 'Amazon' && k.split(' · ').every(x => /^(—\s*(\([^)]*\))?)?$/.test(x.trim())) ? '' : k,
        extra,
        precio: lista.map(v => v.precio).find(Number.isFinite),
        sku: plural(lista.length, p.ecomerce === 'Amazon' ? 'ASIN' : 'SKU', p.ecomerce === 'Amazon' ? 'ASIN' : 'SKU'),
        familia: `${nombreVisual} de ${p.asin}`,
        link: linkDe(lista.find(v => propio(v.sku)) || lista[0]),
        este,
      });
      if (abierta === k) nodo.classList.add('abierta');
      items.push({ nodo, este });
    }

    // Tallas de todo el producto, una sola vez arriba.
    if (orden.length > 1) {
      extras.push(el('div', { className: 'tallas-comunes' }, el('b', { textContent: `${Tn}: ` }),
        ejes ? rangoDe(vs) : `${rangoDe(vs)} (${orden.length})`));
    }
    // Detalle de las tallas del color abierto: tabla (dos medidas) o chips.
    const delColor = abierta != null ? grupos.get(abierta) : null;
    if (delColor && delColor.length > MAX_CHIPS) {
      const cerrar = el('button', { type: 'button', className: 'toggle', textContent: 'Cerrar' });
      cerrar.addEventListener('click', () => { tallaAbierta.delete(p.clave); renderFilas(); });
      detalle = el('div', { className: 'tallas-det' },
        el('div', { className: 'tallas-det-t' }, el('b', { textContent: `${Tn} de ${abierta}` }), el('span', { className: 'muted', textContent: ` · ${resumenDe(delColor)}` }), cerrar),
        ejes ? matriz(delColor) : el('div', { className: 'chips-talla' }, ...delColor.map(chipDe)),
        ejes ? el('div', { className: 'leyenda' }, `● existe (abre esa variante)  ·  · no existe en ${que.f ? 'esta' : 'este'} ${que.s}  ·  `, el('span', { className: 'ley-on', textContent: '●' }), ' va al Excel  ·  ', el('span', { className: 'ley-ago', textContent: '●' }), ' agotada') : null);
    }
  }

  // Muchas miniaturas: las primeras MAX_MINIS (siempre con la que va al Excel) y un botón.
  const todas = todosColores.has(p.clave);
  let vistas = items;
  if (!todas && items.length > MAX_MINIS) {
    vistas = items.slice(0, MAX_MINIS);
    const propia = items.find(x => x.este);
    if (propia && !vistas.includes(propia)) vistas[MAX_MINIS - 1] = propia;
  }
  const titulo = cuantas === vs.length
    ? `El sistema creará ${plural(vs.length, 'variante')} a partir de este producto`
    : `El sistema creará ${plural(vs.length, 'variante')} a partir de este producto (${plural(cuantas, que.s, que.p)}${que.detalle ? `: ${que.detalle}` : ''})`;
  // El detalle de tallas va dentro de la tira; colocarDetalles lo pone bajo la fila del color.
  panel.append(el('div', { className: 't', textContent: titulo }), ...extras, ...notas, el('div', { className: 'tira' }, ...vistas.map(x => x.nodo), detalle));
  if (items.length > MAX_MINIS) {
    const mas = el('button', { type: 'button', className: 'toggle mas', textContent: todas ? `▴ Ver menos ${que.p}` : `▾ Ver ${que.f ? 'las' : 'los'} ${items.length} ${que.p}` });
    mas.addEventListener('click', () => {
      if (todas) todosColores.delete(p.clave);
      else todosColores.add(p.clave);
      renderFilas();
    });
    panel.append(mas);
  }
  if (nota) panel.append(mensaje(el('span', { className: 'muted', textContent: nota })));
  return panel;
}

// Nombre en español de las dimensiones de las variantes. Amazon trae las suyas de la
// página (variationDisplayLabels: en inglés en amazon.com, en español en /-/es/) y
// pueden ser varias ("Special Size Type / Color"); los demás sitios, Color y Talla.
// [singular, plural, femenino].
const NOMBRES_DIM = {
  color: ['color', 'colores'], style: ['estilo', 'estilos'], estilo: ['estilo', 'estilos'],
  size: ['talla', 'tallas', true], talla: ['talla', 'tallas', true], 'special size type': ['tipo de talla', 'tipos de talla'],
  'tamaño': ['tamaño', 'tamaños'], 'pattern name': ['diseño', 'diseños'], pattern: ['diseño', 'diseños'], 'nombre del patrón': ['diseño', 'diseños'],
  flavor: ['sabor', 'sabores'], sabor: ['sabor', 'sabores'], scent: ['aroma', 'aromas'], aroma: ['aroma', 'aromas'],
  capacity: ['capacidad', 'capacidades', true], capacidad: ['capacidad', 'capacidades', true],
  material: ['material', 'materiales'], configuration: ['configuración', 'configuraciones', true], 'configuración': ['configuración', 'configuraciones', true],
  'item package quantity': ['cantidad', 'cantidades', true], cantidad: ['cantidad', 'cantidades', true],
};
// Medidas de ropa: dos juntas (cintura y largo) siguen siendo tallas.
const DIM_TALLA = new Set(['size', 'talla', 'waist size', 'inseam length', 'length', 'band size', 'cup size']);

// { s, p, f, detalle }: una dimensión conocida usa su nombre; varias o desconocidas,
// "opciones" con sus nombres en `detalle` (p. ej. "tipo de talla y color").
function nombreDim(nombres) {
  const ks = nombres.map(n => String(n || '').toLowerCase().replace(/:$/, '').replace(/_name$/, '').replace(/_/g, ' ').trim()).filter(Boolean);
  const uno = ks.length === 1 && NOMBRES_DIM[ks[0]];
  if (uno) return { s: uno[0], p: uno[1], f: !!uno[2], detalle: '' };
  if (ks.length > 1 && ks.every(k => DIM_TALLA.has(k))) return { s: 'talla', p: 'tallas', f: true, detalle: '' };
  const lista = ks.map(k => NOMBRES_DIM[k]?.[0] || k);
  return { s: 'opción', p: 'opciones', f: true, detalle: lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : lista[0] || '' };
}

// "29W–42W": primero y último de una lista ordenada.
const extremos = l => (l.length > 1 ? `${l[0]}–${l.at(-1)}` : l[0] || '');

// Une varias listas ordenadas (las tallas de cada color) en un solo orden: cada valor
// nuevo entra después del anterior de su lista.
function ordenUnido(listas) {
  const out = [];
  for (const l of listas) {
    let prev = -1;
    for (const x of l) {
      let i = out.indexOf(x);
      if (i < 0) { out.splice(prev + 1, 0, x); i = prev + 1; }
      prev = i;
    }
  }
  return out;
}

// Motivo en palabras sencillas (el original queda en el título).
function motivoClaro(motivo) {
  const m = motivo.match(/^Familia repetida: se conserva (.+)$/);
  if (m) {
    const rep = datos.filas.find(f => String(f.producto.asin) === m[1])?.producto;
    return `Es variante de «${rep?.nombre || m[1]}», que sí va al Excel`;
  }
  if (motivo.startsWith('Sin SKU')) return 'Le falta el código: el sistema no podría crearlo';
  return motivo;
}

// Tarjeta de un producto que no irá al Excel.
function tarjetaFuera({ motivo, p }) {
  const card = el('article', { className: `prod${p.clave ? ' con-sel' : ''}` });
  if (p.clave) card.append(casilla(p, card));
  card.append(foto(p.imagen, esHttps(p.link) ? p.link : ''));
  const grupo = datos.grupos.find(g => g.id === p.grupo)?.nombre || p.grupo || '';
  const meta = el('div', { className: 'meta' });
  if (p.ecomerce) meta.append(sitio(p.ecomerce));
  if (p.marca) meta.append(el('span', { textContent: p.marca }));
  meta.append(el('span', { className: 'mono', textContent: p.asin || 'sin SKU' }));
  if (grupo) meta.append(el('span', { textContent: `Grupo: ${grupo}` }));
  card.append(el('div', { className: 'info' },
    el('div', { className: 'nombre', textContent: p.nombre || '(sin nombre)' }),
    meta,
    el('div', { className: 'linea' }, el('span', { className: `pill ${motivo.startsWith('Sin SKU') ? 'bad' : ''}`, textContent: motivoClaro(motivo), title: motivo })),
  ));
  const lado = el('div', { className: 'lado' });
  if (esHttps(p.link)) lado.append(enlace(p.link, `Ver en ${p.ecomerce || 'la tienda'} ↗`));
  if (p.clave) lado.append(botonQuitar(p));
  card.append(lado);
  return card;
}

// Cabecera de un grupo: nombre, opciones elegidas al extraer y cuántos productos.
function cabeceraGrupo(nombre, filas, revisar, vista, claves) {
  const g = datos.grupos.find(x => x.nombre === nombre);
  const c = filas[0]?.celdas || {};
  const fecha = g?.fecha ? new Date(g.fecha) : null;
  const cuando = fecha && !Number.isNaN(fecha.getTime())
    ? ` · extraído el ${fecha.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })} a las ${fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  // Categoría del grupo: la común, "Varias" o "Sin categoría".
  const codigos = new Set(productosDelGrupo(nombre).map(p => p.codCategoria || ''));
  const una = codigos.size === 1 ? [...codigos][0] : null;
  const ultimo = una ? filas.find(f => f.celdas.codigo_categoria === una)?.producto.categoriaTerciaria || una : '';
  const bCat = el('button', { type: 'button', className: `gcat${una === '' ? ' falta' : ''}`, textContent: una ? `🏷 ${ultimo}` : una === '' ? '🏷 Asignar categoría' : '🏷 Varias categorías', title: 'Asignar una categoría a todos los productos del grupo' });
  bCat.disabled = datos.bloqueado;
  bCat.addEventListener('click', () => categoriaGrupo(nombre));
  // Guía de tallas: se activa o desactiva para todo el grupo (desactivar pide confirmación).
  const guia = g?.guiaTalla === true;
  const bGuia = el('button', { type: 'button', className: `pill gguia${guia ? ' on' : ''}`, textContent: guia ? '✓ Con guía de tallas' : 'Sin guía de tallas', title: guia ? 'Clic para desactivar la guía de tallas del grupo' : 'Clic para activar la guía de tallas del grupo' });
  bGuia.setAttribute('aria-pressed', String(guia));
  bGuia.disabled = datos.bloqueado || !g;
  bGuia.addEventListener('click', () => guiaGrupo(g, !guia));
  // Control de la vista: comprimido, resumido, completo.
  const vistas = el('div', { className: 'vistas', role: 'group', title: 'Cómo ver los productos del grupo' });
  vistas.setAttribute('aria-label', `Vista del grupo ${nombre}`);
  for (const [v, txt, tit] of [['comprimido', '▬', 'Comprimido: solo la cabecera'], ['resumido', '☰', `Resumido: ${MAX_RESUMIDO} productos`], ['completo', '▦', 'Completo: todos los productos']]) {
    const b = el('button', { type: 'button', className: vista === v ? 'on' : '', textContent: txt, title: tit });
    b.setAttribute('aria-pressed', String(vista === v));
    b.setAttribute('aria-label', tit);
    b.addEventListener('click', () => ponerVista([nombre], v));
    vistas.append(b);
  }
  // Casilla del grupo: todos sus productos de esta pestaña con los filtros (también los
  // que no se ven por estar resumido o comprimido).
  const marcados = claves.filter(k => seleccion.has(k)).length;
  const check = el('input', { type: 'checkbox', className: 'gsel', checked: !!claves.length && marcados === claves.length, disabled: datos.bloqueado || !claves.length });
  check.indeterminate = marcados > 0 && marcados < claves.length;
  check.title = `Seleccionar los ${plural(claves.length, 'producto')} del grupo`;
  check.setAttribute('aria-label', `Seleccionar los productos del grupo ${nombre}`);
  check.addEventListener('change', () => {
    for (const k of claves) {
      if (check.checked) seleccion.add(k);
      else seleccion.delete(k);
    }
    renderFilas();
  });
  return el('div', { className: 'ghead' },
    check,
    el('h2', { textContent: nombre || '(sin grupo)' }),
    el('span', { className: `pill${c.variacion === 'Sí' ? ' on' : ''}`, textContent: c.variacion === 'Sí' ? '✓ Con variantes' : 'Sin variantes', title: 'Se elige al extraer. Para cambiarlo, vuelve a extraer la página.' }),
    bGuia,
    bCat,
    revisar ? el('span', { className: 'pill warn', textContent: `⚠ ${revisar} para revisar` }) : null,
    el('span', { className: 'info', textContent: `${plural(filas.length, 'producto')}${cuando}` }),
    vistas,
  );
}

// Productos de la lista de un grupo (van o no al Excel), con su clave.
const productosDelGrupo = nombre => [...datos.filas.map(f => f.producto), ...datos.fuera.map(x => x.p)].filter(p => p.clave && p.grupo === nombre);

// Claves de los productos que se ven ("seleccionar todos").
let clavesVisibles = [];

// Pone cada detalle de tallas justo después de la última miniatura de la fila del color
// abierto (como una fila nueva debajo) y su flecha bajo ese color. Depende del ancho de
// la ventana: se repite al cambiarlo.
function colocarDetalles() {
  for (const det of $('rows').querySelectorAll('.tira > .tallas-det')) {
    const tira = det.parentElement;
    const abierta = tira.querySelector('.v.abierta');
    tira.append(det);
    if (!abierta) continue;
    let ultima = abierta;
    for (let x = abierta.nextElementSibling; x && x !== det && x.offsetTop === abierta.offsetTop; x = x.nextElementSibling) ultima = x;
    ultima.after(det);
    det.style.setProperty('--flecha', `${abierta.offsetLeft - tira.offsetLeft + abierta.offsetWidth / 2}px`);
  }
}
let esperaAncho = null;
window.addEventListener('resize', () => { clearTimeout(esperaAncho); esperaAncho = setTimeout(colocarDetalles, 100); });

function renderFilas() {
  pasada++;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === pestana);
  let nodos;
  let vistos;
  let totalPestana;
  if (pestana === 'fuera') {
    const vistas = datos.fuera.filter(visibleFuera);
    clavesVisibles = vistas.map(x => x.p.clave).filter(Boolean);
    nodos = vistas.map(tarjetaFuera);
    vistos = vistas.length;
    totalPestana = datos.fuera.length;
  } else {
    const base = filasConAvisos().filter(([, a]) => pestana !== 'revisar' || a.length);
    const vistas = base.filter(([f]) => visible(f));
    clavesVisibles = vistas.map(([f]) => f.producto.clave);
    // Agrupadas por grupo, en el orden de las filas del Excel.
    const porGrupo = new Map();
    for (const fa of vistas) {
      if (!porGrupo.has(fa[0].ref.grupo)) porGrupo.set(fa[0].ref.grupo, []);
      porGrupo.get(fa[0].ref.grupo).push(fa);
    }
    // Con texto en el buscador se ven todas las coincidencias (sin resumir).
    const buscando = !!$('search').value.trim();
    clavesVisibles = [];
    nodos = [...porGrupo].map(([nombre, lista]) => {
      const vista = buscando ? 'completo' : vistaDe(nombre);
      const revisar = lista.filter(([, a]) => a.length).length;
      // Resumido: los primeros del Excel, como en la vista completa (corregir un aviso
      // no mueve nada; los que tienen avisos están en "Para revisar").
      let dibujar = vista === 'comprimido' ? [] : lista;
      if (vista === 'resumido') dibujar = lista.slice(0, MAX_RESUMIDO);
      clavesVisibles.push(...lista.map(([f]) => f.producto.clave));
      const resto = lista.length - dibujar.length;
      let pie = null;
      if (vista !== 'comprimido' && resto) {
        pie = el('button', { type: 'button', className: 'pie-grupo', textContent: `▾ Ver ${resto === 1 ? 'el producto restante' : `los ${resto} productos restantes`}` });
        pie.addEventListener('click', () => ponerVista([nombre], 'completo'));
      } else if (vista === 'completo' && !buscando && lista.length > MAX_RESUMIDO) {
        pie = el('button', { type: 'button', className: 'pie-grupo', textContent: `▴ Resumir (ver ${MAX_RESUMIDO})` });
        pie.addEventListener('click', () => ponerVista([nombre], 'resumido'));
      }
      return el('section', { className: `grupo ${vista}` },
        cabeceraGrupo(nombre, lista.map(([f]) => f), revisar, vista, lista.map(([f]) => f.producto.clave)),
        ...dibujar.map(([f, a]) => tarjetaProducto(f, a)),
        pie);
    });
    vistos = vistas.length;
    totalPestana = base.length;
  }
  $('rows').replaceChildren(...nodos);
  colocarDetalles();
  renderSeleccion();
  $('shown').textContent = vistos === totalPestana ? plural(vistos, 'producto') : `${vistos} de ${plural(totalPestana, 'producto')}`;
  $('emptyRows').hidden = !!vistos;
  $('emptyRows').textContent = !datos.total ? 'La lista está vacía: extrae productos desde el popup.'
    : totalPestana && vistos === 0 ? 'Ningún producto coincide con la búsqueda o los filtros.'
      : pestana === 'revisar' ? 'Ningún producto tiene avisos: todo listo para descargar.'
        : pestana === 'fuera' ? 'Todos los productos de la lista van al Excel: ninguno repite familia ni le falta el código.'
          : 'Ningún producto coincide con la búsqueda o los filtros.';
}

function elegirPestana(t) {
  pestana = t;
  renderFilas();
}

// Barra de selección (abajo, solo con algo marcado) y casilla "Seleccionar todos".
function renderSeleccion() {
  const n = seleccion.size;
  $('selBar').hidden = !n;
  $('selCount').textContent = plural(n, 'producto seleccionado', 'productos seleccionados');
  $('removeSelected').disabled = datos.bloqueado;
  $('removeSelected').textContent = `Quitar (${n})`;
  $('catSelected').disabled = datos.bloqueado;
  $('catSelected').textContent = `🏷 Asignar categoría (${n})`;
  const vis = clavesVisibles.filter(k => seleccion.has(k)).length;
  $('selectAll').checked = !!clavesVisibles.length && vis === clavesVisibles.length;
  $('selectAll').indeterminate = vis > 0 && vis < clavesVisibles.length;
  $('selectAll').disabled = datos.bloqueado || !clavesVisibles.length;
  $('selectAllTxt').textContent = `Seleccionar todos (${clavesVisibles.length})`;
  $('lockNote').hidden = !datos.bloqueado;
}

async function render() {
  datos = await cargar();
  // La selección solo guarda productos que siguen en la lista.
  for (const k of [...seleccion]) if (!datos.claves.has(k)) seleccion.delete(k);
  if (datos.bloqueado) seleccion.clear();
  renderResumen();
  renderFiltros();
  renderFilas();
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

// ---------- asignar categoría ----------

// Envía la categoría al service worker (bajo el mismo lock que las extracciones) y
// ofrece Deshacer.
async function asignar(claves, cat) {
  if (!cat || !claves.length) return;
  const msg = cat.limpiar ? { type: 'limpiarCategoria', claves } : { type: 'asignarCategoria', claves, cat };
  const r = await chrome.runtime.sendMessage(msg).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo cambiar la categoría.', true);
  seleccion.clear();
  ultimoCambio = { tipo: 'categoria', datos: r.previos || [] };
  const n = ultimoCambio.datos.length;
  const hecho = cat.limpiar ? `Se quitó la categoría a ${plural(n, 'producto')}.` : `Categoría «${cat.ruta}» asignada a ${plural(n, 'producto')}.`;
  avisoDeshacer(n ? hecho : 'Esos productos ya no estaban en la lista.', false, n > 0);
  await render();
}

const rutaDe = p => p.categoriaRuta || [p.categoria, p.categoriaSecundaria, p.categoriaTerciaria].filter(Boolean).join(' / ') || p.codCategoria;
const nombreDe = p => `«${p.nombre || p.asin || 'producto'}»`;

// Confirma antes de cambiar una categoría ya asignada (o de quitarla). Devuelve las
// claves a las que aplicar o null si se cancela. `donde`: texto para el mensaje.
async function confirmarCategoria(ps, cat, donde) {
  const nueva = cat.limpiar ? '' : cat.codigo;
  const otra = ps.filter(p => p.codCategoria && p.codCategoria !== nueva);
  const sin = ps.filter(p => !p.codCategoria);
  if (cat.limpiar) {
    if (!otra.length) { avisoDeshacer('Esos productos ya están sin categoría.', false, false); return null; }
    const r = await preguntar(`¿Quitar la categoría de ${ps.length === 1 ? nombreDe(ps[0]) : `los ${plural(otra.length, 'producto')} con categoría ${donde}`}?\n\nQuedarán sin categoría: se elige en la plantilla después de descargar. Podrás deshacerlo justo después.`, 'Quitar categoría');
    return r === 'cancelar' ? null : otra.map(p => p.clave);
  }
  if (!otra.length) return ps.map(p => p.clave);
  if (ps.length === 1) {
    const r = await preguntar(`${nombreDe(ps[0])} ya tiene la categoría «${rutaDe(ps[0])}».\n\n¿Cambiarla por «${cat.ruta}»?`, 'Cambiar categoría');
    return r === 'cancelar' ? null : [ps[0].clave];
  }
  const actuales = [...new Set(otra.map(rutaDe))];
  const lista = actuales.slice(0, 3).map(r => `• ${r}`).join('\n') + (actuales.length > 3 ? `\n• y ${actuales.length - 3} más` : '');
  const r = await preguntar(
    `${otra.length === ps.length ? `Los ${ps.length} productos` : `${otra.length} de los ${ps.length} productos`} ${donde} ya ${otra.length === 1 ? 'tiene' : 'tienen'} otra categoría:\n${lista}\n\n¿A cuáles asignar «${cat.ruta}»?`,
    `Cambiar a todos (${ps.length})`,
    sin.length ? `Solo a los ${plural(sin.length, 'producto')} sin categoría` : '');
  if (r === 'cancelar') return null;
  return (r === 'familia' ? sin : ps).map(p => p.clave);
}

async function categoriaProducto(p) {
  if (datos.bloqueado) return;
  const cat = await elegirCategoria({ titulo: p.codCategoria ? 'Cambiar la categoría' : 'Asignar categoría', subtitulo: p.nombre || p.asin || '', actual: p.codCategoria || '', limpiar: !!p.codCategoria });
  if (!cat) return;
  const claves = await confirmarCategoria([p], cat, '');
  if (claves) return asignar(claves, cat);
}

// Todo el grupo (también sus productos que no van al Excel).
async function categoriaGrupo(nombre) {
  if (datos.bloqueado) return;
  const ps = productosDelGrupo(nombre);
  if (!ps.length) return;
  const codigos = new Set(ps.map(p => p.codCategoria || ''));
  const comun = codigos.size === 1 ? [...codigos][0] : '';
  const cat = await elegirCategoria({ titulo: `Categoría del grupo «${nombre}»`, subtitulo: `Se asignará a sus ${plural(ps.length, 'producto')}.`, actual: comun, limpiar: ps.some(p => p.codCategoria) });
  if (!cat) return;
  const claves = await confirmarCategoria(ps, cat, `de «${nombre}»`);
  if (claves) return asignar(claves, cat);
}

// Guía de tallas del grupo `g` (de datos.grupos, con su id). Activar no pregunta.
async function guiaGrupo(g, valor) {
  if (datos.bloqueado || !g) return;
  if (!valor && await preguntar(`¿Desactivar la guía de tallas del grupo «${g.nombre}»?\n\nSus filas irán con guia_talla = No.`, 'Desactivar') === 'cancelar') return;
  const r = await chrome.runtime.sendMessage({ type: 'cambiarGuiaTalla', grupo: g.id, valor }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo cambiar la guía de tallas.', true);
  ultimoCambio = null;
  avisoDeshacer(`Guía de tallas ${valor ? 'activada' : 'desactivada'} en «${g.nombre}».`, false, false);
  await render();
}

// Productos seleccionados (los que siguen en la lista).
async function categoriaSeleccion() {
  if (!seleccion.size || datos.bloqueado) return;
  const ps = [...datos.filas.map(f => f.producto), ...datos.fuera.map(x => x.p)].filter(p => p.clave && seleccion.has(p.clave));
  if (!ps.length) return;
  const cat = await elegirCategoria({ titulo: 'Asignar categoría', subtitulo: `Se asignará a ${plural(ps.length, 'producto seleccionado', 'productos seleccionados')}.`, limpiar: ps.some(p => p.codCategoria) });
  if (!cat) return;
  const claves = await confirmarCategoria(ps, cat, 'seleccionados');
  if (claves) return asignar(claves, cat);
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
  seleccion.clear();
  ultimoCambio = { tipo: 'quitar', datos: r.quitados || [] };
  const n = ultimoCambio.datos.length;
  avisoDeshacer(n ? `Se ${n === 1 ? 'quitó' : 'quitaron'} ${plural(n, 'producto')} de la lista.` : 'Esos productos ya no estaban en la lista.', false, n > 0);
  await render();
}

$('undoClose').addEventListener('click', () => { $('undoBar').hidden = true; ultimoCambio = null; });
$('undoBtn').addEventListener('click', async () => {
  if (!ultimoCambio?.datos.length) return;
  const cambio = ultimoCambio;
  if (cambio.tipo === 'categoria') {
    const r = await chrome.runtime.sendMessage({ type: 'restaurarCategoria', previos: cambio.datos }).catch(e => ({ error: e.message }));
    if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo deshacer.', true);
    ultimoCambio = null;
    avisoDeshacer(`Se devolvió la categoría anterior a ${plural(r.restaurados, 'producto')}.`, false, false);
    return render();
  }
  const r = await chrome.runtime.sendMessage({ type: 'restaurarProductos', quitados: cambio.datos }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo deshacer.', true);
  const faltan = cambio.datos.length - r.restaurados;
  ultimoCambio = null;
  avisoDeshacer(`${r.restaurados === 1 ? 'Volvió 1 producto' : `Volvieron ${r.restaurados} productos`} a la lista.${faltan ? ` ${plural(faltan, 'producto')} no: ya ${faltan === 1 ? 'estaba' : 'estaban'} de nuevo en la lista o su grupo se eliminó.` : ''}`, false, false);
  await render();
});

$('removeSelected').addEventListener('click', () => pedirQuitar([...seleccion]));
$('catSelected').addEventListener('click', categoriaSeleccion);
$('selectAll').addEventListener('change', () => {
  for (const k of clavesVisibles) {
    if ($('selectAll').checked) seleccion.add(k);
    else seleccion.delete(k);
  }
  renderFilas();
});

// ---------- descarga ----------

function updateNamePreview() {
  const nombre = exportFileName($('exportName').value, config?.xlsx?.filenamePrefix || DEFAULT_PREFIX);
  $('exportNamePreview').textContent = `Se guardará como: ${nombre}`;
  // Nombre largo: cortado con "…"; completo al pasar el mouse.
  $('exportNamePreview').title = nombre;
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

$('groupFilter').addEventListener('change', renderFilas);
$('siteFilter').addEventListener('change', () => { renderFiltros(); renderFilas(); });
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => elegirPestana(b.dataset.tab));
$('techToggle').checked = tecnico;
$('techToggle').addEventListener('change', () => {
  tecnico = $('techToggle').checked;
  try { localStorage.setItem(TECNICO, tecnico ? '1' : '0'); } catch { /* sin almacenamiento */ }
  renderFilas();
});
$('clearSel').addEventListener('click', () => { seleccion.clear(); renderFilas(); });
$('search').addEventListener('input', renderFilas);
$('vistaTodos').addEventListener('change', () => {
  const v = $('vistaTodos').value;
  $('vistaTodos').value = '';
  if (v) ponerVista(datos.grupos.map(g => g.nombre), v);
});
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
