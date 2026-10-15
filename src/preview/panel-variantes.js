// Variantes en la vista previa: las etiquetas junto a la categoría (infoFamilia), el
// desplegable "▸ Ver variantes" (panelVariantes) y la búsqueda automática de las
// variantes de Sephora, Michael Kors, Marc Jacobs y Kate Spade (buscarVariantes), con
// su caché en storage.local (variantesLeidas, 7 días).
import { el, plural } from '../comun/dom.js';
import { leeVariantes, descargarVariantes } from '../comun/lectores-variantes.js';
import { estado, vista, esHttps, familiaDe, representaFamilia, foto } from './estado.js';

// Productos con el desplegable de variantes abierto (por clave) y variantes leídas de
// la página del producto (Sephora, Michael Kors, o extraídos antes de la v1.13.0): { variantes,
// dims } | { cargando } | { error }. Las leídas se guardan en storage.local
// (variantesLeidas) y se recuerdan 7 días.
export const abiertos = new Set();
export const cargadas = new Map();
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
export const cola = { activa: false, detenida: false };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// Variantes leídas en otra visita (storage.local.variantesLeidas), si siguen vigentes.
export function cargarLeidas(variantesLeidas) {
  for (const [k, v] of Object.entries(variantesLeidas)) {
    if (cargadas.get(k)?.variantes || v?.version !== VERSION_LEIDAS || !Array.isArray(v.variantes) || !(Date.now() - (v.fecha || 0) < VIGENCIA_MS)) continue;
    cargadas.set(k, { variantes: v.variantes, dims: Array.isArray(v.dims) ? v.dims : [], ...(typeof v.nota === 'string' && v.nota ? { nota: v.nota } : {}), ...(Array.isArray(v.aparte) && v.aparte.length ? { aparte: v.aparte } : {}) });
  }
}

// Cierra los desplegables de variantes y tallas de un producto.
export function cerrarVariantes(clave) {
  abiertos.delete(clave);
  tallaAbierta.delete(clave);
  todosColores.delete(clave);
}

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
    vista.renderFilas();
  });
  return btn;
}

// Familia del producto (Amazon con variantes, Kate Spade) o variantes leídas de su
// página (Sephora, Michael Kors…): etiquetas junto a la categoría. Solo informativo.
// Los extraídos antes de la v1.12.0 no traen esas cifras.
export function infoFamilia(p) {
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
        boton('Reintentar', () => { cargadas.delete(p.clave); cola.detenida = false; vista.renderFilas(); buscarVariantes(); }));
    } else if (cola.detenida && !cola.activa && !c) {
      nodos.push(el('span', { className: 'muted', textContent: 'Variantes sin leer' }),
        boton('Buscar variantes', () => { cola.detenida = false; buscarVariantes(); }));
    } else nodos.push(el('span', { className: 'muted', textContent: 'Buscando variantes…' }));
  }
  if (tieneVariantes(p)) nodos.push(botonVariantes(p));
  if (familia && p.familiaOmitidos) nodos.push(el('span', { className: 'muted', textContent: `${plural(p.familiaOmitidos, 'omitido')} al extraer (misma familia)` }));
  return nodos;
}

// ---------- variantes de la familia (desplegable) ----------

// ¿Tiene otras variantes que mostrar? Un "Sin variantes" (familiaTam 1) no,
// salvo que traiga varias (Kate Spade: un solo estilo con varios colores).
// Sephora y Michael Kors no tienen familias: con *Extraer variantes* en el grupo el
// sistema crea todas las variantes del producto (tonos; colores y tallas), que se
// buscan solas al abrir la vista previa.
export const buscaVariantes = p => !!p.conVariaciones && leeVariantes(p);
export const tieneVariantes = p => (buscaVariantes(p)
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
  const F = Fam.porEcomerce(estado.config)[Fam.ecomerceDe(p)]?.F;
  cargadas.set(p.clave, { cargando: true });
  vista.renderFilas();
  const r = leeVariantes(p) ? await descargarVariantes(p)
    : F ? await Fam.descargar(p.asin, F, undefined, p.link) : { error: 'el sitio no tiene familias' };
  const ok = !!(r.familia || r.variantes);
  const dato = ok
    ? { variantes: r.variantes || [], dims: r.dimensiones || [], ...(r.nota ? { nota: r.nota } : {}), ...(Array.isArray(r.aparte) && r.aparte.length ? { aparte: r.aparte } : {}) }
    : { error: r.error === 'captcha' ? 'el sitio pidió verificación (CAPTCHA); abre el producto en Chrome y vuelve a intentarlo' : r.error };
  cargadas.set(p.clave, dato);
  if (ok) await guardarLeida(p.clave, dato);
  vista.renderFilas();
  vista.renderResumen();
  return r;
}

// Productos del Excel (Sephora, Michael Kors) con *Extraer variantes* cuyas variantes faltan.
export const porBuscar = () => (estado.datos?.filas || []).map(f => f.producto).filter(p => buscaVariantes(p) && !cargadas.has(p.clave));

// Busca las variantes uno a uno, con la misma pausa que las familias (1,5–3 s)
// para no provocar bloqueos. Tras un bloqueo se detiene: el resto queda "sin leer".
export async function buscarVariantes() {
  if (cola.activa) return;
  cola.activa = true;
  cola.detenida = false;
  vista.renderResumen();
  try {
    for (let n = 0, p; (p = porBuscar()[0]); n++) {
      if (n) await esperar(globalThis.__cfFamilias.pausa({}));
      if (cargadas.has(p.clave) || !estado.datos.claves.has(p.clave)) continue;
      const r = await cargarVariantes(p);
      if (r.error === 'captcha') { cola.detenida = true; break; }
    }
  } finally {
    cola.activa = false;
    vista.renderFilas();
    vista.renderResumen();
  }
}

// Mensaje dentro del desplegable (cargando, error, sin estado.datos).
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
export function panelVariantes(f) {
  const p = f.producto;
  const panel = el('div', { className: 'vars' });
  const d = variantesDe(p);
  if (!d) {
    panel.append(mensajeCargar(p, 'Cargar variantes', 'Se extrajo antes de la v1.13.0: sus variantes no se guardaron. Se pueden leer de la página del producto (una descarga).'));
    return panel;
  }
  const { vs, dims } = d;
  if (!vs.length) {
    panel.append(mensaje(el('span', { className: 'muted', textContent: 'La página del producto no trae estado.datos de sus variantes.' })));
    return panel;
  }

  const X = estado.config.xlsx || {};
  // Productos de la lista de la misma familia ("No irán al Excel"): traen nombre y precio.
  const deLista = new Map((estado.datos.omitidosPorFamilia.get(familiaDe(p, X)) || []).map(h => [String(h.asin).toUpperCase(), h]));
  let origen = 'https://www.amazon.com';
  try { if (esHttps(p.link)) origen = new URL(p.link).origin; } catch { /* link inválido */ }
  // La variante que va al Excel: el ASIN o estilo; en Sephora, el skuId del link.
  const idExcel = String((p.ecomerce === 'Sephora' ? p.variante : p.asin) || '').toUpperCase();
  const propio = sku => !!idExcel && String(sku || '').toUpperCase() === idExcel;
  // Amazon: /dp/ASIN en el mismo dominio del producto; Kate Spade trae su link.
  const linkDe = v => (esHttps(v.link) ? v.link : /^[A-Z0-9]{10}$/i.test(v.sku || '') && p.ecomerce !== 'Kate Spade' ? `${origen}/dp/${v.sku}` : '');

  // Miniatura de una variante: imagen, nombre propio (si lo trae), atributos, extra
  // (nodo bajo los atributos), precio, sku y familia (en estado.datos técnicos), link y si es
  // la que va al Excel.
  const mini = ({ imagen, nombre, atributos, extra, precio, sku, familia, link, este }) => {
    const v = el('div', { className: `v${este ? ' este' : ''}` });
    v.append(foto(imagen, link));
    if (nombre) v.append(el('div', { textContent: nombre }));
    if (atributos) v.append(el('div', { className: 'attrs', textContent: atributos }));
    if (!nombre && !atributos) v.append(el('div', { className: 'mono', textContent: sku }));
    if (extra) v.append(extra);
    if (Number.isFinite(precio)) v.append(el('div', { className: 'precio', textContent: `$${precio.toFixed(2)}` }));
    if (estado.tecnico) v.append(el('div', {}, el('span', { className: 'code', textContent: sku, title: familia })));
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
          vista.renderFilas();
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
      cerrar.addEventListener('click', () => { tallaAbierta.delete(p.clave); vista.renderFilas(); });
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
      vista.renderFilas();
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
