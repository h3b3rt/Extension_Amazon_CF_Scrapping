// Extracciones: la que está en curso y la cola (storage.local "jobs"). Las ejecuta
// el service worker (background.js), así siguen aunque el popup se cierre; el popup
// solo las pide y muestra su avance. Aquí también se guarda el resultado de cada
// una en la lista, como grupo con su resumen, y en el historial.
import { saveHistoryEntry } from './history.js';
import { getPrefs } from './prefs.js';
import { newGroupId, syncGroups, productsForExport } from './groups.js';
import { productKey } from './sites.js';
import { getConfig } from './config.js';
import { getCachedCategories } from './categories.js';
import { downloadXlsx, exportSummary } from './export.js';

export async function getJobs() {
  const { jobs } = await chrome.storage.local.get('jobs');
  return { actual: null, cola: [], ultimo: null, ...(jobs || {}) };
}

export const setJobs = jobs => chrome.storage.local.set({ jobs });

// ¿La página ya está en curso o en la cola?
export const jobForUrl = (jobs, url) => [jobs.actual, ...jobs.cola].find(j => j?.url === url) || null;

// Texto de las páginas extraídas ("de la 3 a la 4").
function paginasTxt(c, job) {
  const desde = job.paginaInicial || 1;
  if (c.porPaginas) {
    const rango = job.conNumeroDePagina ? ` (${c.paginas > 1 ? `de la ${desde} a la ${desde + c.paginas - 1}` : `página ${desde}`})` : '';
    return `Páginas extraídas: ${c.paginas} de ${c.paginasPedidas}${rango}`;
  }
  return `Cargados: ${c.cargados} (límite ${c.limite} productos, páginas: ${c.paginas})`;
}

/**
 * Guarda el resultado de una extracción: productos en la lista, grupo nuevo con su
 * resumen e historial. Sin acumular, descarga además su propio Excel.
 * @returns {{ ok: boolean, mensaje: string, productos: number }}
 */
export async function guardarResultado(job, r, motivo = '') {
  const productos = r?.productos || [];
  const layoutsTxt = (r?.layouts || []).map(l => `${l.label}: ${l.extraidos} de ${l.encontrados}`).join('\n');
  if (!productos.length) {
    return { ok: false, productos: 0, mensaje: [motivo || r?.error || 'No se encontraron productos compatibles en esta página.', layoutsTxt].filter(Boolean).join('\n\n') };
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
  const catTxt = cat ? `${cat.ruta}${cat.codigo ? ` (${cat.codigo})` : ''}` : 'sin llenar (elegir en la plantilla)';
  const resumen = [
    `Sitio: ${site.name}`,
    `Categoría: ${catTxt}`,
    r.tipoPagina ? `Tipo de página: ${r.tipoPagina.label}` : '',
    r.marcaPagina ? `Marca de la tienda (solo referencia): ${r.marcaPagina}` : '',
    r.cargaMas ? paginasTxt(r.cargaMas, job) : '',
    `Productos: ${productos.length}`,
    `Sin imagen: ${productos.filter(p => !p.imagen).length}`,
    `Sin precio: ${productos.filter(p => !p.precio).length}`,
    ...avisos,
    layoutsTxt ? `\n${layoutsTxt}` : '',
  ].filter(Boolean);

  grupos[grupo] = {
    nombre: job.nombreGrupo, origen: url, fecha: new Date().toISOString(), titulo: job.title, categoria: cat?.ruta || '', resumen,
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
      mensaje += `\n\n${exportSummary(await downloadXlsx(productsForExport(lista, grupos), config, categorias, job.fileName))}`;
    } catch (e) {
      mensaje += `\n\n⚠ No se pudo descargar el Excel: ${e.message}`;
    }
  }
  return { ok: true, productos: productos.length, mensaje };
}
