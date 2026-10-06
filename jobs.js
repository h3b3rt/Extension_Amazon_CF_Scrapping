// Extracciones: la que está en curso y la cola (storage.local "jobs"). Las ejecuta
// el service worker (background.js), así siguen aunque el popup se cierre; el popup
// solo las pide y muestra su avance. Aquí también se guarda el resultado de cada
// una en la lista, como grupo con su resumen, y en el historial.
import { saveHistoryEntry } from './history.js';
import { getPrefs } from './prefs.js';
import { newGroupId, syncGroups, opcionesDe, opcionesTxt } from './groups.js';
import { productKey } from './sites.js';
import { getConfig } from './config.js';
import { getCachedCategories } from './categories.js';
import { exportList, exportSummary } from './export.js';
import './familias.js';

export async function getJobs() {
  const { jobs } = await chrome.storage.local.get('jobs');
  return { actual: null, cola: [], ultimo: null, ...(jobs || {}) };
}

export const setJobs = jobs => chrome.storage.local.set({ jobs });

// ¿La página ya está en curso o en la cola?
export const jobForUrl = (jobs, url) => [jobs.actual, ...jobs.cola].find(j => j?.url === url) || null;

// "45 s", "2 min 15 s", "1 h 5 min".
export function duracionTxt(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// Productos cuya familia hay que verificar antes de exportar: los que aún no la
// tienen, de Amazon en grupos con variaciones (sin variaciones no se agrupan) y de
// Kate Spade siempre (ver familias.js, porEcomerce).
export const sinFamilia = (collected, groups, config) => {
  const Fam = globalThis.__cfFamilias;
  const mapa = Fam.porEcomerce(config);
  return Object.keys(collected).filter(k => {
    const p = collected[k];
    return !p.familia && Fam.agrupa(mapa, p, opcionesDe(groups[p.grupo]).variaciones);
  });
};

// Texto de las páginas extraídas ("de la 3 a la 4").
function paginasTxt(c, job, conFamilias) {
  const desde = job.paginaInicial || 1;
  if (c.porPaginas) {
    const rango = job.conNumeroDePagina ? ` (${c.paginas > 1 ? `de la ${desde} a la ${desde + c.paginas - 1}` : `página ${desde}`})` : '';
    return `Páginas extraídas: ${c.paginas} de ${c.paginasPedidas}${rango}`;
  }
  return `Cargados: ${c.cargados}${conFamilias ? ' familias' : ''} (límite ${c.limite}${conFamilias ? '' : ' productos'}, páginas: ${c.paginas})`;
}

// Aviso de verificación (CAPTCHA o bloqueo) del sitio que cortó la verificación de familias.
export const captchaTxt = (sitio = 'Amazon') => (sitio === 'Amazon'
  ? '⚠ Amazon pidió una verificación (CAPTCHA): se dejaron de verificar familias. Ábrela en amazon.com y resuélvela antes de exportar.'
  : `⚠ ${sitio} bloqueó las descargas (verificación del sitio): se dejaron de verificar familias. Abre la página de ${sitio}, espera unos minutos y vuelve a exportar (se verifican al exportar).`);

// Resumen de la verificación de familias (un producto por familia).
function familiasTxt(F, sitio) {
  if (!F) return { lineas: [], avisos: [] };
  const avisos = [];
  if (F.enPagina) avisos.push(`Omitidos por familia repetida (se conservó el primero de la página): ${F.enPagina}`);
  for (const [g, n] of Object.entries(F.enLista || {})) avisos.push(`⚠ Omitidos porque su familia ya está en la lista (grupo «${g}»): ${n}`);
  if (F.sinVerificar) avisos.push(`⚠ Familia sin verificar: ${F.sinVerificar} (se vuelve a intentar al exportar; ver ref_duplicado)`);
  if (F.captcha) avisos.push(captchaTxt(sitio?.name));
  return { lineas: [`Productos analizados: ${F.analizados} · Familias: ${F.familias}`], avisos };
}

/**
 * Familias de los productos del mismo ecommerce que ya están en la lista, para que
 * la extracción omita los de una familia que ya está (salvo el mismo SKU, que pasa
 * al grupo nuevo). Sin acumular, o sin familias activas: null.
 * `hermanos` (Kate Spade): los otros estilos de esas familias, guardados al verificarlas.
 */
export async function familiasDeLaLista(job) {
  if (!job.cfg?.familias || !(await getPrefs()).accumulate) return null;
  const Fam = globalThis.__cfFamilias;
  const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
  const ecomerce = job.cfg.ecomerce || 'Amazon';
  const mapa = { [ecomerce]: { siempre: job.cfg.familias.siempre === true } };
  const porAsin = {};
  const hermanos = {};
  const grupos = {};
  for (const p of Object.values(collected)) {
    // Amazon: solo cuentan los grupos con variaciones (sin ellas, cada ASIN es un producto aparte).
    if (Fam.ecomerceDe(p) !== ecomerce || !p.familia || !Fam.agrupa(mapa, p, opcionesDe(groups[p.grupo]).variaciones)) continue;
    // Reemplazar borra los productos de esta página: no cuentan.
    if (job.replace && p.origen === job.url) continue;
    porAsin[p.asin] = p.familia;
    for (const h of Array.isArray(p.hermanos) ? p.hermanos : []) hermanos[h] ??= p.familia;
    grupos[p.familia] ??= groups[p.grupo]?.nombre || 'Sin grupo';
  }
  return { porAsin, hermanos, grupos };
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * Antes de exportar: lee la familia de los productos de la lista que no la tienen
 * (Amazon de versiones anteriores, o sin verificar) y la guarda en la lista. Cada
 * sitio con su configuración de familias (`config.sites[].familias`). Se detiene si
 * `detener()` devuelve true; tras un CAPTCHA deja de descargar de ese sitio.
 * @returns {{ verificados: number, sinVerificar: number, captcha: boolean, captchaSitios: string[], detenida: boolean, total: number }}
 */
export async function verificarLista(config, avance = () => {}, detener = async () => false) {
  const Fam = globalThis.__cfFamilias;
  const mapa = Fam.porEcomerce(config);
  const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
  const claves = sinFamilia(collected, groups, config);
  // "ecommerce:SKU" → familia: las ya verificadas de la lista (con sus hermanos) y las nuevas.
  const conocidas = new Map();
  for (const p of Object.values(collected)) {
    if (!p.familia) continue;
    for (const h of [p.asin, ...(Array.isArray(p.hermanos) ? p.hermanos : [])]) {
      const c = `${Fam.ecomerceDe(p)}:${h}`;
      if (!conocidas.has(c)) conocidas.set(c, p.familia);
    }
  }
  const r = { verificados: 0, sinVerificar: 0, captcha: false, captchaSitios: [], detenida: false, total: claves.length };
  const bloqueados = new Set();
  const descargas = {};
  for (const [i, k] of claves.entries()) {
    if (await detener()) { r.detenida = true; break; }
    await avance(i + 1, claves.length);
    const p = collected[k];
    const ecomerce = Fam.ecomerceDe(p);
    const F = mapa[ecomerce]?.F;
    const conocida = (hs = []) => [p.asin, ...hs].map(h => conocidas.get(`${ecomerce}:${h}`)).find(Boolean) || '';
    let f = conocida();
    let hermanos = null;
    if (!f && F && !bloqueados.has(ecomerce)) {
      if (descargas[ecomerce]) await esperar(Fam.pausa(F));
      descargas[ecomerce] = (descargas[ecomerce] || 0) + 1;
      const d = await Fam.descargar(p.asin, F, undefined, p.link);
      if (d.error === 'captcha') { bloqueados.add(ecomerce); r.captcha = true; r.captchaSitios.push(ecomerce); }
      if (d.familia) {
        f = conocida(d.hermanos) || d.familia;
        for (const h of d.hermanos) if (!conocidas.has(`${ecomerce}:${h}`)) conocidas.set(`${ecomerce}:${h}`, f);
        if (F.guardarHermanos) hermanos = d.hermanos;
      }
    }
    if (f) conocidas.set(`${ecomerce}:${p.asin}`, f);
    // Se guarda en la lista actual (pudo cambiar mientras tanto).
    const { collected: actual = {} } = await chrome.storage.local.get('collected');
    if (!actual[k]) continue;
    if (f) {
      actual[k].familia = f;
      if (hermanos) actual[k].hermanos = hermanos;
      delete actual[k].familiaAviso;
      r.verificados++;
    } else { actual[k].familiaAviso = Fam.AVISO; r.sinVerificar++; }
    await chrome.storage.local.set({ collected: actual });
  }
  return r;
}

/**
 * Guarda el resultado de una extracción: productos en la lista, grupo nuevo con su
 * resumen e historial. Sin acumular, descarga además su propio Excel.
 * @returns {{ ok: boolean, mensaje: string, productos: number }}
 */
export async function guardarResultado(job, r, motivo = '') {
  const productos = r?.productos || [];
  const layoutsTxt = (r?.layouts || []).map(l => `${l.label}: ${l.extraidos} de ${l.encontrados}`).join('\n');
  const fam = familiasTxt(r?.familias, job.site);
  if (!productos.length) {
    // P. ej. una página de producto cuya familia ya está en la lista.
    const porFamilia = fam.avisos.length ? [...fam.lineas, ...fam.avisos].join('\n') : '';
    const duracion = job.duracionMs != null ? `Duración: ${duracionTxt(job.duracionMs)}` : '';
    return { ok: false, productos: 0, mensaje: [motivo || r?.error || 'No se encontraron productos compatibles en esta página.', porFamilia, layoutsTxt, duracion].filter(Boolean).join('\n\n') };
  }
  const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
  const prefs = await getPrefs();
  const config = await getConfig();
  const { site, cfg, cat, url } = job;

  const lista = prefs.accumulate ? { ...collected } : {};
  const grupos = prefs.accumulate ? { ...groups } : {};
  let eliminados = 0;
  if (job.replace) {
    // Reemplazar = empezar de cero: se borran los productos y el grupo de esta página.
    for (const [key, p] of Object.entries(lista)) {
      if (p.origen === url) { delete lista[key]; eliminados++; }
    }
    for (const [id, g] of Object.entries(grupos)) if (g.origen === url) delete grupos[id];
  }
  const grupo = newGroupId();
  let nuevos = 0;
  let movidos = 0;
  for (const p of productos) {
    // Mismo SKU en otro grupo: gana esta extracción (datos y grupo) y no se repite.
    const key = productKey(site, p.asin);
    if (lista[key]) movidos++;
    else nuevos++;
    delete lista[key];
    lista[key] = {
      ...p,
      ecomerce: cfg.ecomerce || config.xlsx?.ecomerce || site.name,
      categoria: cat?.principal || '',
      categoriaSecundaria: cat?.secundaria || '',
      categoriaTerciaria: cat?.terciaria || '',
      codCategoria: cat?.codigo || '',
      categoriaRuta: cat?.ruta || '',
      origen: url,
      grupo,
    };
  }

  // Resumen fijo del grupo (se ve en el desplegable de la lista).
  const avisos = [];
  if (r.cargaMas?.aviso) avisos.push(`⚠ ${r.cargaMas.aviso}`);
  if (motivo) avisos.push(`⚠ ${motivo}`);
  // Sitios con SKU en el link: un producto sin SKU válido se omite (el backend lo descartaría o lo guardaría mal).
  if ((cfg.skuFromLink || cfg.variant) && r.sinSku) avisos.push(`⚠ Omitidos sin SKU en el link: ${r.sinSku}`);
  if (r.excluidos) avisos.push(`Anuncios omitidos (Sponsored): ${r.excluidos}`);
  // Marc Jacobs: el backend guarda un producto por modelo (corta el color tras el "-").
  if (r.agrupados) avisos.push(`Colores agrupados en su modelo (una fila por modelo): ${r.agrupados}`);
  avisos.push(...fam.avisos);
  const catTxt = cat ? `${cat.ruta}${cat.codigo ? ` (${cat.codigo})` : ''}` : 'sin llenar (elegir en la plantilla)';
  // Elegidas al extraer y fijas: van primero, para que se vean.
  const opciones = opcionesDe(job.opciones);
  const resumen = [
    opcionesTxt(opciones),
    job.duracionMs != null ? `Duración: ${duracionTxt(job.duracionMs)}` : '',
    `Sitio: ${site.name}`,
    `Categoría: ${catTxt}`,
    r.tipoPagina ? `Tipo de página: ${r.tipoPagina.label}` : '',
    r.marcaPagina ? `Marca de la tienda (solo referencia): ${r.marcaPagina}` : '',
    r.cargaMas ? paginasTxt(r.cargaMas, job, !!r.familias) : '',
    `Productos: ${productos.length}`,
    ...fam.lineas,
    `Sin imagen: ${productos.filter(p => !p.imagen).length}`,
    `Sin precio: ${productos.filter(p => !p.precio).length}`,
    ...avisos,
    layoutsTxt ? `\n${layoutsTxt}` : '',
  ].filter(Boolean);

  grupos[grupo] = {
    nombre: job.nombreGrupo, origen: url, fecha: new Date().toISOString(), titulo: job.title, categoria: cat?.ruta || '', resumen,
    ...opciones,
  };
  syncGroups(lista, grupos);
  await chrome.storage.local.set({ collected: lista, groups: grupos });
  await saveHistoryEntry(url, {
    fecha: new Date().toISOString(),
    categoria: cat?.ruta || '',
    codigo: cat?.codigo || '',
    productos: productos.length,
    titulo: job.title,
  });

  let mensaje = `✓ ${job.replace ? 'Datos anteriores reemplazados' : 'Extracción completada'}\n\nGrupo: ${job.nombreGrupo}\n${resumen.join('\n')}`;
  if (prefs.accumulate) {
    if (job.replace) mensaje += `\n\nEliminados de la extracción anterior: ${eliminados}`;
    mensaje += `\n${job.replace ? '' : '\n'}Nuevos añadidos: ${nuevos}`;
    if (movidos) mensaje += `\nYa estaban en otro grupo (pasan a este): ${movidos}`;
    mensaje += `\nTotal en la lista: ${Object.keys(lista).length}`;
  } else {
    try {
      const categorias = (await getCachedCategories()).items || [];
      mensaje += `\n\n${exportSummary(await exportList(lista, grupos, config, categorias, job.fileName))}`;
    } catch (e) {
      mensaje += `\n\n⚠ No se pudo descargar el Excel: ${e.message}`;
    }
  }
  return { ok: true, productos: productos.length, mensaje };
}
