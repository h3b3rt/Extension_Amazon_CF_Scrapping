// Descarga del Excel: la usan el popup ("Descargar Excel") y el service worker
// (extracciones sin acumular, que descargan su propio archivo al terminar, y la
// exportación que antes verifica las familias de Amazon).
import { buildWorkbook } from './xlsx.js';
import { productsForExport } from './groups.js';
import './familias.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const DEFAULT_PREFIX = 'Plantilla_Scraping';

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

// "Audífonos HyperX" -> "Audífonos_HyperX". Quita caracteres no válidos en Windows.
export function sanitizeFileName(name) {
  return (name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
}

// Nombre final: <nombre elegido o prefijo por defecto>_<fecha>_<hora>.xlsx
export function exportFileName(name, prefix = DEFAULT_PREFIX) {
  return `${sanitizeFileName(name) || prefix}_${timestamp()}.xlsx`;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Genera el xlsx desde plantilla.xlsx con las categorías actuales en Mapeo_categorias.
export async function downloadXlsx(products, config, categories, name = '') {
  const template = await (await fetch(chrome.runtime.getURL('plantilla.xlsx'))).arrayBuffer();
  const { bytes, summary } = await buildWorkbook(template, products, { config: config.xlsx, categories });
  if (!summary.filas) throw new Error('Ningún producto tiene SKU: no se generó el archivo.');
  const url = `data:${XLSX_MIME};base64,${toBase64(bytes)}`;
  const filename = exportFileName(name, config.xlsx?.filenamePrefix || DEFAULT_PREFIX);
  await chrome.downloads.download({ url, filename });
  return { filename, ...summary };
}

// La lista en el Excel: un producto de Amazon por familia (gana el que se agregó
// primero a la lista: los grupos van en orden de extracción).
export async function exportList(collected, groups, config, categories, name = '') {
  const { productos, omitidos } = globalThis.__cfFamilias.unoPorFamilia(productsForExport(collected, groups));
  return { ...(await downloadXlsx(productos, config, categories, name)), familiaRepetida: omitidos };
}

// Resumen del archivo descargado (avisos solo si hay algo que revisar).
export function exportSummary(r) {
  const lines = [`Excel descargado: ${r.filename}`, `Filas: ${r.filas}`];
  const rep = r.familiaRepetida || [];
  if (rep.length) {
    const ej = rep.slice(0, 5).map(o => `${o.asin} (= ${o.conservado})`).join(', ');
    lines.push(`Omitidos por familia repetida en la lista: ${rep.length}: ${ej}${rep.length > 5 ? '…' : ''}`);
  }
  if (r.sinFamilia) lines.push(`⚠ Familia sin verificar: ${r.sinFamilia} (ver ref_duplicado; pueden repetir familia)`);
  if (r.reacondicionados) lines.push(`Condición "Reacondicionado": ${r.reacondicionados} (revisar)`);
  if (r.sinCategoria) lines.push(`Sin categoría (elegir en la plantilla): ${r.sinCategoria}`);
  if (r.duplicados) lines.push(`Posibles variantes repetidas: ${r.duplicados} (ver ref_duplicado)`);
  if (r.omitidos) lines.push(`⚠ Omitidos sin SKU: ${r.omitidos}`);
  if (r.conGuion) lines.push(`⚠ SKU con guion: ${r.conGuion} (el sistema lo corta en el primer "-")`);
  return lines.join('\n');
}
