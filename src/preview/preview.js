// Vista previa del Excel (preview.html, en una pestaña): las mismas filas que tendrá
// el archivo, calculadas con filasExcel (xlsx.js) sobre la lista actual, mostradas
// como tarjetas por grupo para quien revisa el contenido (las columnas del Excel, con
// "Ver datos técnicos"), con sus avisos y los productos que no irán al Excel. Permite
// quitar productos de la lista (Quitar o las casillas de producto y grupo), con Deshacer; lo hace
// el service worker (quitarProductos).
// Partes: estado.js (estado compartido), panel-variantes.js (variantes) y acciones.js
// (quitar, categoría, guía de tallas, Deshacer).
// Se actualiza sola cuando cambia la lista (por ejemplo, durante una extracción).
// Todo el contenido se arma con textContent: los datos vienen de páginas externas.
import { getConfig, extensionVersion } from '../comun/config.js';
import { getHistory } from '../comun/history.js';
import { syncGroups, sortedGroups, productsForExport } from '../comun/groups.js';
import { filasExcel } from '../comun/xlsx.js';
import { sinFamilia } from '../comun/jobs.js';
import { getCachedCategories } from '../comun/categories.js';
import { sitesOf, siteIcon, DEFAULT_ICON } from '../comun/sites.js';
import { exportSummary, exportFileName, DEFAULT_PREFIX } from '../comun/export.js';
import { descargarLista, encoladaTxt } from '../comun/descarga.js';
import { $, el, plural, showStatus } from '../comun/dom.js';
import '../inyectados/familias.js';
import { estado, conectar, esHttps, idDe, familiaDe, representaFamilia, productosDelGrupo, foto, nuevaPasada } from './estado.js';
import { abiertos, cargadas, cola, cargarLeidas, cerrarVariantes, buscaVariantes, tieneVariantes, infoFamilia, panelVariantes, porBuscar, buscarVariantes } from './panel-variantes.js';
import { pedirQuitar, categoriaProducto, categoriaGrupo, guiaGrupo } from './acciones.js';

// Grupo pedido desde el popup ("Ver sus productos en la vista previa").
const grupoInicial = new URLSearchParams(location.search).get('grupo') || '';
let datos = null;
let config = null;
// Claves elegidas con las casillas (compartidas con acciones.js).
const { seleccion } = estado;
// ---------- datos ----------

async function cargar() {
  const { collected = {}, groups = {}, variantesLeidas = {} } = await chrome.storage.local.get(['collected', 'groups', 'variantesLeidas']);
  cargarLeidas(variantesLeidas);
  // Productos de versiones anteriores sin grupo: el mismo reparto que hace el popup
  // (aquí solo en memoria; el popup lo guarda).
  syncGroups(collected, groups, await getHistory());
  config = estado.config = await getConfig();
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
try { tecnico = estado.tecnico = localStorage.getItem(TECNICO) === '1'; } catch { /* sin almacenamiento */ }
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
    if (grupos.has(p.grupo)) cerrarVariantes(p.clave);
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
  nuevaPasada();
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
  datos = estado.datos = await cargar();
  // La selección solo guarda productos que siguen en la lista.
  for (const k of [...seleccion]) if (!datos.claves.has(k)) seleccion.delete(k);
  if (datos.bloqueado) seleccion.clear();
  renderResumen();
  renderFiltros();
  renderFilas();
  $('download').disabled = !datos.total;
  if (!cola.detenida && porBuscar().length) buscarVariantes();
}

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
  tecnico = estado.tecnico = $('techToggle').checked;
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

conectar({ render, renderFilas, renderResumen });
render().then(updateNamePreview).catch(error => {
  console.error(error);
  showStatus(`No se pudo armar la vista previa: ${error.message}`, 'error');
});
