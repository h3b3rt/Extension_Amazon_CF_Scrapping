// Acciones de la vista previa que cambian la lista (las hace el service worker, bajo su
// lock): quitar productos (con la pregunta "solo este / familia completa"), asignar o
// quitar la categoría, la guía de tallas de un grupo, y Deshacer.
import { $, plural } from '../comun/dom.js';
import { elegirCategoria } from '../comun/selector-categoria.js';
import { estado, vista, familiaDe, representaFamilia, productosDelGrupo } from './estado.js';

const { seleccion } = estado;
// Último cambio, para Deshacer: { tipo: 'quitar', datos: quitados } o { tipo: 'categoria', datos: previos }.
let ultimoCambio = null;

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
export async function pedirQuitar(claves) {
  claves = [...new Set(claves)].filter(Boolean);
  if (!claves.length || estado.datos.bloqueado) return;
  const elegidos = new Set(claves);
  const X = estado.config.xlsx || {};
  const afectadas = estado.datos.filas.map(f => f.producto)
    .filter(p => elegidos.has(p.clave))
    .map(p => ({ p, hermanos: (estado.datos.omitidosPorFamilia.get(familiaDe(p, X)) || []).filter(h => !elegidos.has(h.clave)) }))
    .filter(a => a.hermanos.length);
  const extra = afectadas.flatMap(a => a.hermanos.map(h => h.clave));
  let texto;
  let solo;
  let familia = '';
  if (claves.length === 1 && !afectadas.length) {
    const p = [...estado.datos.filas.map(f => f.producto), ...estado.datos.fuera.map(f => f.p)].find(x => x.clave === claves[0]);
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
    const solos = estado.datos.filas.map(f => f.producto)
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
  await vista.render();
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

export async function categoriaProducto(p) {
  if (estado.datos.bloqueado) return;
  const cat = await elegirCategoria({ titulo: p.codCategoria ? 'Cambiar la categoría' : 'Asignar categoría', subtitulo: p.nombre || p.asin || '', actual: p.codCategoria || '', limpiar: !!p.codCategoria });
  if (!cat) return;
  const claves = await confirmarCategoria([p], cat, '');
  if (claves) return asignar(claves, cat);
}

// Todo el grupo (también sus productos que no van al Excel).
export async function categoriaGrupo(nombre) {
  if (estado.datos.bloqueado) return;
  const ps = productosDelGrupo(nombre);
  if (!ps.length) return;
  const codigos = new Set(ps.map(p => p.codCategoria || ''));
  const comun = codigos.size === 1 ? [...codigos][0] : '';
  const cat = await elegirCategoria({ titulo: `Categoría del grupo «${nombre}»`, subtitulo: `Se asignará a sus ${plural(ps.length, 'producto')}.`, actual: comun, limpiar: ps.some(p => p.codCategoria) });
  if (!cat) return;
  const claves = await confirmarCategoria(ps, cat, `de «${nombre}»`);
  if (claves) return asignar(claves, cat);
}

// Guía de tallas del grupo `g` (de estado.datos.grupos, con su id). Activar no pregunta.
export async function guiaGrupo(g, valor) {
  if (estado.datos.bloqueado || !g) return;
  if (!valor && await preguntar(`¿Desactivar la guía de tallas del grupo «${g.nombre}»?\n\nSus filas irán con guia_talla = No.`, 'Desactivar') === 'cancelar') return;
  const r = await chrome.runtime.sendMessage({ type: 'cambiarGuiaTalla', grupo: g.id, valor }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo cambiar la guía de tallas.', true);
  ultimoCambio = null;
  avisoDeshacer(`Guía de tallas ${valor ? 'activada' : 'desactivada'} en «${g.nombre}».`, false, false);
  await vista.render();
}

// Productos seleccionados (los que siguen en la lista).
async function categoriaSeleccion() {
  if (!seleccion.size || estado.datos.bloqueado) return;
  const ps = [...estado.datos.filas.map(f => f.producto), ...estado.datos.fuera.map(x => x.p)].filter(p => p.clave && seleccion.has(p.clave));
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
  await vista.render();
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
    return vista.render();
  }
  const r = await chrome.runtime.sendMessage({ type: 'restaurarProductos', quitados: cambio.datos }).catch(e => ({ error: e.message }));
  if (!r || r.error) return avisoDeshacer(r?.error || 'No se pudo deshacer.', true);
  const faltan = cambio.datos.length - r.restaurados;
  ultimoCambio = null;
  avisoDeshacer(`${r.restaurados === 1 ? 'Volvió 1 producto' : `Volvieron ${r.restaurados} productos`} a la lista.${faltan ? ` ${plural(faltan, 'producto')} no: ya ${faltan === 1 ? 'estaba' : 'estaban'} de nuevo en la lista o su grupo se eliminó.` : ''}`, false, false);
  await vista.render();
});

$('removeSelected').addEventListener('click', () => pedirQuitar([...seleccion]));
$('catSelected').addEventListener('click', categoriaSeleccion);
