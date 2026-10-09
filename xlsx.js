// Genera el Excel de carga a partir de plantilla.xlsx (la plantilla de scraping
// del sistema). No usa librerías: el xlsx es un zip de XML, se abre con
// DecompressionStream, se insertan las filas y se vuelve a comprimir.
//
// Reglas del backend (POST /product/upload/list, lee con XLSX.sheet_to_json sin opciones):
// - Solo lee la primera hoja y las columnas por nombre de encabezado.
// - Una celda vacía escrita como "" llega como '' y rompe el `??` del backend
//   (con sku vacío el SP descarta la fila). Por eso las celdas sin valor NO se escriben.
// - Lee el valor guardado de las fórmulas: codigo_categoria lleva fórmula y valor.

// Columnas que el backend lee: una columna de ayuda nunca puede usar estos nombres.
const BACKEND_COLUMNS = new Set([
  'ecomerce', 'sku', 'link', 'variacion', 'condicion', 'marca', 'nombre', 'categoria_general', 'codigo_categoria',
  'color', 'talla', 'seguimiento', 'guia_talla', 'cantidad_imagen', 'peso', 'precio', 'stock', 'created_code',
  'variant_id', 'parent_sku', 'base_sku',
]);
const REQUIRED = ['ecomerce', 'sku', 'condicion', 'link', 'seguimiento'];
const SEARCH_HEADER = 'Buscar categoria';
const CODE_HEADER = 'codigo_categoria';
// Las columnas de ayuda van después de esta; las de la plantilla que la siguen
// (marca, nombre, precio…, casi siempre vacías) se corren a la derecha.
const REF_AFTER = 'seguimiento';
const REF_FIELDS = new Set(['imagen', 'nombre', 'marca', 'precio', 'link', 'asin', 'variante', 'duplicado', 'grupo']);

// ---------- zip ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// Devuelve [{ name, data }] en el orden del archivo, ya descomprimidos.
async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('La plantilla no es un archivo xlsx válido.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Plantilla xlsx dañada.');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await pipe(raw, new DecompressionStream('deflate-raw'));
    else throw new Error(`Compresión ${method} no soportada en la plantilla.`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function writeZip(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const comp = await pipe(data, new CompressionStream('deflate-raw'));
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // nombres en UTF-8
    header.setUint16(8, 8, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, comp.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(header.buffer), nameBytes, comp);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 8, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, comp.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + comp.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer());
}

// ---------- xml ----------

const esc = s => String(s)
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
const colIndex = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const cellCol = ref => colIndex(ref.match(/^[A-Z]+/)[0]);

const ROW_RE = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
const CELL_RE = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const attr = (xml, name) => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

function parseSharedStrings(xml = '') {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
}

// Celda: texto en línea, número o fórmula (con valor guardado opcional).
function cellXml(ref, style, value) {
  const s = style != null ? ` s="${style}"` : '';
  if (value?.formula) {
    const f = value.array ? `<f t="array" ref="${ref}">${esc(value.formula)}</f>` : `<f>${esc(value.formula)}</f>`;
    return value.cached != null && value.cached !== ''
      ? `<c r="${ref}"${s} t="str">${f}<v>${esc(value.cached)}</v></c>`
      : `<c r="${ref}"${s}>${f}</c>`;
  }
  if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (value == null || value === '') return style != null ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}

// Resuelve la ruta de cada hoja (en orden) desde workbook.xml y sus relaciones.
function sheetPaths(files) {
  const wb = files.get('xl/workbook.xml') || '';
  const rels = files.get('xl/_rels/workbook.xml.rels') || '';
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const id = attr(m[0], 'r:id');
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(r => r[0]).find(r => attr(r, 'Id') === id);
    const target = attr(rel || '', 'Target') || '';
    return { name: unesc(attr(m[0], 'name') || ''), path: target.startsWith('/') ? target.slice(1) : `xl/${target}` };
  });
}

// ---------- contenido ----------

// "Reacondicionado" si el título lo indica; si no, el valor por defecto ("Nuevo").
function condicionDe(nombre, cfg) {
  const c = cfg.condicion || {};
  let re = null;
  try { re = c.pattern ? new RegExp(c.pattern, 'i') : null; } catch { /* patrón remoto inválido */ }
  return re?.test(nombre || '') ? c.match || 'Reacondicionado' : c.default || 'Nuevo';
}

// Misma ruta que usa la hoja Mapeo_categorias: "Principal > Secundaria > Terciaria".
export const rutaMapeo = c => [c.primaria, c.secundaria, c.terciaria].filter(Boolean).join(' > ');

// Filas con el mismo nombre o la misma imagen: posibles variantes de un mismo padre.
function duplicados(products, firstRow) {
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const index = new Map();
  products.forEach((p, i) => {
    for (const key of [`n:${norm(p.nombre)}`, `i:${p.imagen || ''}`]) {
      if (key.length <= 2) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(i);
    }
  });
  return products.map((p, i) => {
    const otros = new Set();
    for (const key of [`n:${norm(p.nombre)}`, `i:${p.imagen || ''}`]) {
      for (const j of index.get(key) || []) if (j !== i) otros.add(j);
    }
    if (!otros.size) return '';
    const filas = [...otros].sort((a, b) => a - b).map(j => j + firstRow);
    return `Posible variante: fila${filas.length > 1 ? 's' : ''} ${filas.join(', ')}`;
  });
}

// Cambia la columna de una celda (r="J5") o de cada rango de un sqref ("J2:J1000 K2:K9").
const moverCelda = (xml, mover) => xml.replace(/\br="([A-Z]+)(\d+)"/, (m, c, r) => `r="${colName(mover(colIndex(c)))}${r}"`);
const moverSqref = (xml, mover) => xml.replace(/\bsqref="([^"]*)"/g, (m, v) => `sqref="${v.replace(/(\$?)([A-Z]{1,3})(\$?\d+)/g, (x, a, c, r) => `${a}${colName(mover(colIndex(c)))}${r}`)}"`);

// Extiende "X2:Y1000" a la última fila usada cuando hay más productos que filas en la plantilla.
function extendRanges(xml, fromRow, toRow) {
  if (toRow <= fromRow) return xml;
  const re = new RegExp(`(\\$?[A-Z]+\\$?2:\\$?[A-Z]+\\$?)${fromRow}\\b`, 'g');
  return xml.replace(/sqref="([^"]*)"/g, (m, v) => `sqref="${v.replace(re, `$1${toRow}`)}"`);
}

// Anchos: las columnas de la plantilla después de `firstRef - 1` se corren tantas
// como columnas de ayuda haya, y las de ayuda toman su ancho propio.
function setCols(xml, firstRef, refColumns) {
  const n = refColumns.length;
  const rango = (col, min, max) => col.replace(/\bmin="\d+"/, `min="${min}"`).replace(/\bmax="\d+"/, `max="${max}"`);
  return xml.replace(/<cols>([\s\S]*?)<\/cols>/, (m, inner) => {
    const kept = [];
    for (const col of inner.match(/<col\b[^>]*\/>/g) || []) {
      const min = +attr(col, 'min');
      const max = +attr(col, 'max');
      if (max < firstRef) kept.push(col);
      else if (min >= firstRef) kept.push(rango(col, min + n, max + n));
      else kept.push(rango(col, min, firstRef - 1), rango(col, firstRef + n, max + n));
    }
    const own = refColumns.map((c, i) => `<col customWidth="1" min="${firstRef + i}" max="${firstRef + i}" width="${Number(c.width) || 14}"/>`);
    const all = [...kept, ...own].sort((a, b) => +attr(a, 'min') - +attr(b, 'min'));
    return `<cols>${all.join('')}</cols>`;
  });
}

function fillMapeo(xml, categories) {
  const rows = categories.map((c, i) => {
    const r = i + 2;
    const vals = [c.codigo, c.primaria, c.secundaria, c.terciaria, rutaMapeo(c)];
    return `<row r="${r}">${vals.map((v, k) => cellXml(`${colName(k + 1)}${r}`, null, v)).join('')}</row>`;
  }).join('');
  return xml.replace(/(<row\b[^>]*\br="1"[^>]*>[\s\S]*?<\/row>)/, `$1${rows}`);
}

/**
 * Valores de cada fila del Excel, por nombre de columna. Los usan el Excel y la
 * vista previa (preview.js), así lo que se ve antes de descargar es lo que se descarga.
 * Los productos sin SKU no tienen fila (el backend los descartaría).
 * @param {object[]} products productos ya preparados (productsForExport + uno por familia)
 * @param {object} config config.xlsx
 * @returns {{ filas: { fila: number, producto: object, celdas: object, ref: object }[], sinSku: object[], resumen: object }}
 *   celdas: columnas que lee el backend ('' = la celda no se escribe); ref: campos de las columnas ref_*.
 */
export function filasExcel(products, config = {}) {
  const conSku = products.filter(p => (p.asin || '').trim());
  const sinSku = products.filter(p => !(p.asin || '').trim());
  const dup = duplicados(conSku, 2);
  // Ecommerce cuyo SKU el bot de scraping saca del link (todos menos Amazon): la celda
  // sku no se escribe. Y al revés, los que van solo con sku (Amazon): sin link.
  const skuSoloLink = new Set(Array.isArray(config.skuOnlyInLink) ? config.skuOnlyInLink : ['Sephora', 'Michael Kors', 'Marc Jacobs', 'Kate Spade']);
  const sinLink = new Set(Array.isArray(config.linkOmit) ? config.linkOmit : ['Amazon']);
  const resumen = {
    filas: conSku.length,
    omitidos: sinSku.length,
    conGuion: 0,
    reacondicionados: 0,
    duplicados: dup.filter(Boolean).length,
    sinFamilia: conSku.filter(p => p.familiaAviso).length,
    sinCategoria: conSku.filter(p => !p.codCategoria).length,
  };
  const filas = conSku.map((p, i) => {
    // Cada producto trae el ecommerce de su sitio; los de versiones anteriores, el general.
    const ecomerce = p.ecomerce || config.ecomerce || 'Amazon';
    const sku = skuSoloLink.has(ecomerce) ? '' : p.asin.trim();
    if (sku.includes('-')) resumen.conGuion++;
    const condicion = condicionDe(p.nombre, config);
    if (condicion !== (config.condicion?.default || 'Nuevo')) resumen.reacondicionados++;
    // Categoría elegida en el popup: ruta en "Buscar categoria" y código ya calculado.
    // Con "No llenar categoría" quedan vacías para usar el buscador de la plantilla.
    const codigo = p.codCategoria || '';
    const ruta = codigo ? rutaMapeo({ primaria: p.categoria, secundaria: p.categoriaSecundaria, terciaria: p.categoriaTerciaria }) : '';
    const precio = parseFloat(p.precio);
    return {
      fila: i + 2,
      producto: p,
      celdas: {
        ecomerce,
        sku,
        // Opciones del grupo elegidas al extraer ("Sí" / "No"; ver groups.js).
        variacion: p.variacion || '',
        guia_talla: p.guiaTalla || '',
        condicion,
        link: sinLink.has(ecomerce) ? '' : p.link || '',
        [SEARCH_HEADER]: ruta,
        [CODE_HEADER]: codigo,
        seguimiento: config.seguimiento || 'Scraping',
      },
      ref: {
        ...Object.fromEntries([...REF_FIELDS].map(f => [f, p[f] || ''])),
        // Amazon: "Familia sin verificar" si no se pudo leer su familia (puede repetir otra fila).
        duplicado: [dup[i], p.familiaAviso].filter(Boolean).join(' · '),
        precio: Number.isFinite(precio) ? precio : '',
      },
    };
  });
  return { filas, sinSku, resumen };
}

/**
 * Crea el xlsx de carga.
 * @param {ArrayBuffer} template plantilla.xlsx
 * @param {object[]} products productos de la lista (asin = SKU, ecomerce, nombre, marca, imagen, precio, link, codCategoria...)
 * @param {{ config: object, categories: object[] }} opts config.xlsx y categorías del sistema
 * @returns {Promise<{ bytes: Uint8Array, summary: object }>}
 */
export async function buildWorkbook(template, products, { config = {}, categories = [] } = {}) {
  const entries = await readZip(template);
  const dec = new TextDecoder();
  const files = new Map(entries.filter(e => /\.(xml|rels)$/.test(e.name)).map(e => [e.name, dec.decode(e.data)]));
  const sheets = sheetPaths(files);
  if (!sheets.length) throw new Error('La plantilla no tiene hojas.');
  const mainPath = sheets[0].path;
  const mapeo = sheets.find(s => s.name === 'Mapeo_categorias');
  let xml = files.get(mainPath);
  const strings = parseSharedStrings(files.get('xl/sharedStrings.xml'));

  // Encabezados de la fila 1: nombre -> número de columna.
  const rows = xml.match(ROW_RE) || [];
  const rowNum = r => +attr(r, 'r');
  const headerRow = rows.find(r => rowNum(r) === 1) || '';
  const headers = new Map();
  for (const c of headerRow.match(CELL_RE) || []) {
    const v = c.match(/<v>([^<]*)<\/v>/)?.[1];
    const t = attr(c, 't');
    const text = t === 's' ? strings[+v] : t === 'inlineStr' ? unesc(c.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '') : v;
    if (text) headers.set(text.trim(), cellCol(attr(c, 'r')));
  }
  const missing = REQUIRED.filter(h => !headers.has(h));
  if (missing.length) throw new Error(`La plantilla no tiene las columnas: ${missing.join(', ')}.`);

  // Fila modelo: la última de la plantilla (estilos por columna y fórmula de categoría).
  const lastTemplateRow = Math.max(1, ...rows.map(rowNum));
  const modelRow = rows.find(r => rowNum(r) === lastTemplateRow) || '';
  const styles = new Map();
  let codeFormula = null;
  for (const c of modelRow.match(CELL_RE) || []) {
    const col = cellCol(attr(c, 'r'));
    if (attr(c, 's') != null) styles.set(col, attr(c, 's'));
    if (col === headers.get(CODE_HEADER)) {
      const f = c.match(/<f\b([^>]*)>([\s\S]*?)<\/f>/);
      if (f) codeFormula = { array: /t="array"/.test(f[1]), text: unesc(f[2]) };
    }
  }

  // Columnas de ayuda después de "seguimiento" (sin ella, después de la última de la
  // plantilla). Las de la plantilla que quedan a su derecha se corren `n` columnas.
  const refColumns = (config.refColumns || []).filter(c => c?.header && !BACKEND_COLUMNS.has(c.header) && !headers.has(c.header)
    && (REF_FIELDS.has(c.field) || c.imageOf));
  const anchor = headers.get(REF_AFTER) ?? Math.max(...headers.values());
  const firstRef = anchor + 1;
  const mover = col => (col > anchor ? col + refColumns.length : col);
  const refCol = new Map(refColumns.map((c, i) => [c.header, firstRef + i]));
  const refStyle = attr(headerRow.match(CELL_RE)?.find(c => cellCol(attr(c, 'r')) > anchor) || '', 's');
  const dataStyle = styles.get(headers.get('link')) ?? null;
  for (const [h, col] of headers) headers.set(h, mover(col));
  const estilos = [...styles];
  styles.clear();
  for (const [col, s] of estilos) styles.set(mover(col), s);

  const { filas, resumen } = filasExcel(products, config);
  const lastRow = filas.length + 1;
  const rowHeight = Number(config.rowHeight) || 0;

  // Fila 1: encabezados de la plantilla (corridos) + columnas de ayuda.
  const headerCells = (headerRow.match(CELL_RE) || []).map(c => moverCelda(c, mover));
  const ownHeaders = refColumns.map((c, i) => ({ col: firstRef + i, xml: cellXml(`${colName(firstRef + i)}1`, refStyle, c.header) }));
  const headerXml = headerRow.replace(/>[\s\S]*<\/row>$|\/>$/, m => {
    const cells = [...headerCells.map(c => ({ col: cellCol(attr(c, 'r')), xml: c })), ...ownHeaders].sort((a, b) => a.col - b.col);
    return `>${cells.map(c => c.xml).join('')}</row>`;
  });

  const dataRows = filas.map(f => {
    const r = f.fila;
    const values = new Map();
    for (const h of ['ecomerce', 'sku', 'condicion', 'link', 'seguimiento', 'variacion', 'guia_talla', SEARCH_HEADER]) {
      if (headers.has(h) && f.celdas[h]) values.set(headers.get(h), f.celdas[h]);
    }
    if (headers.has(CODE_HEADER)) {
      const col = headers.get(CODE_HEADER);
      const codigo = f.celdas[CODE_HEADER];
      const formula = codeFormula?.text.replace(new RegExp(`\\b([A-Z]+)${lastTemplateRow}\\b`, 'g'), `$1${r}`);
      values.set(col, formula ? { formula, array: codeFormula.array, cached: codigo } : codigo);
    }
    for (const c of refColumns) {
      const col = refCol.get(c.header);
      if (c.imageOf) {
        const src = refCol.get(c.imageOf);
        if (src && f.producto.imagen) values.set(col, { formula: (config.imageFormula || 'IMAGE({celda})').replace('{celda}', `${colName(src)}${r}`) });
      } else {
        values.set(col, f.ref[c.field] ?? '');
      }
    }
    const cols = [...new Set([...styles.keys(), ...values.keys()])].filter(Boolean).sort((a, b) => a - b);
    const cells = cols.map(col => {
      const ref = `${colName(col)}${r}`;
      const style = styles.get(col) ?? (col >= firstRef ? dataStyle : null);
      return cellXml(ref, style, values.get(col));
    }).join('');
    const ht = rowHeight ? ` ht="${rowHeight}" customHeight="1"` : '';
    return `<row r="${r}"${ht}>${cells}</row>`;
  });

  // Filas restantes de la plantilla (vacías, con fórmula y formato) se conservan,
  // pero sin el valor guardado "" de la fórmula: si no, sheet_to_json las lee
  // como filas con codigo_categoria = '' en lugar de filas vacías.
  const rest = rows.filter(r => rowNum(r) > lastRow)
    .map(r => r.replace(/<c\b([^>]*?) t="str"([^>]*)>(<f\b[\s\S]*?<\/f>)<v><\/v><\/c>/g, '<c$1$2>$3</c>'))
    .map(r => r.replace(CELL_RE, c => moverCelda(c, mover)));
  xml = xml.replace(/<sheetData>[\s\S]*<\/sheetData>|<sheetData\/>/, `<sheetData>${[headerXml, ...dataRows, ...rest].join('')}</sheetData>`);
  xml = setCols(xml, firstRef, refColumns);
  // Desplegables y formato condicional de las columnas corridas.
  xml = moverSqref(xml, mover);
  xml = extendRanges(xml, lastTemplateRow, lastRow);
  files.set(mainPath, xml);

  if (mapeo && files.has(mapeo.path)) {
    files.set(mapeo.path, fillMapeo(files.get(mapeo.path), categories));
    // El desplegable de "Buscar categoria" apunta a la hoja de mapeo: que cubra todas las categorías.
    const lastCat = categories.length + 1;
    files.set(mainPath, files.get(mainPath).replace(/(Mapeo_categorias!\$[A-Z]+\$2:\$[A-Z]+\$)(\d+)/g, (m, a, n) => `${a}${Math.max(+n, lastCat)}`));
  }
  // Recalcular al abrir en Excel/LibreOffice (Google Sheets recalcula siempre).
  files.set('xl/workbook.xml', files.get('xl/workbook.xml').replace(/<calcPr\b[^>]*?\/>/, m => (/fullCalcOnLoad/.test(m) ? m : m.replace('<calcPr', '<calcPr fullCalcOnLoad="1"'))));

  const enc = new TextEncoder();
  const out = entries.map(e => (files.has(e.name) ? { name: e.name, data: enc.encode(files.get(e.name)) } : e));
  return {
    bytes: await writeZip(out),
    summary: resumen,
  };
}
