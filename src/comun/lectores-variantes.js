// Variantes (colores, tallas, tonos) de un producto, leídas de su página para la vista
// previa: Sephora, Michael Kors, Marc Jacobs y Kate Spade. Solo las usa la vista
// previa, así que no se inyecta en la pestaña (las de Amazon las lee familias.js al
// extraer, junto con la familia).
// leeVariantes(p): ¿el sitio del producto tiene lector? descargarVariantes(p): descarga
// p.link y devuelve { variantes, dimensiones } o { error }; nunca lanza error.
import '../inyectados/familias.js';

// estilo(): la misma normalización que usan las familias de Kate Spade.
const { estilo } = globalThis.__cfFamilias;
// Tope de variantes por producto (ocupan espacio en storage.local), como en familias.js.
const MAX_VARIANTES = 200;
const https = v => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : '');

// Precio "$24.00" → 24; NaN si no hay.
const numero = v => parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));

/**
 * Tonos/tamaños de un producto de Sephora: `regularChildSkus` del script#linkStore
 * de su página (los `ancillarySkus` son otros productos). Solo de una descarga
 * fresca: en la pestaña, tras navegar, el linkStore puede ser de otro producto o de
 * otro SKU, así que se exige que `productId` sea el pedido (P123456).
 */
function variantesSephora(html, productId) {
  const m = String(html || '').match(/<script[^>]*id=["']linkStore["'][^>]*>([\s\S]*?)<\/script>/i);
  let prod;
  try { prod = m ? JSON.parse(m[1])?.page?.product : null; } catch { prod = null; }
  if (!prod) return { error: 'sin datos' };
  if (String(prod.productId || '').toUpperCase() !== String(productId || '').toUpperCase()) return { error: 'la página no es de este producto' };
  const variantes = [];
  for (const s of Array.isArray(prod.regularChildSkus) ? prod.regularChildSkus : []) {
    const sku = String(s?.skuId || '').trim();
    if (!/^\d+$/.test(sku)) continue;
    const v = { sku, atributos: [String(s.variationValue || s.variationDesc || sku)] };
    if (typeof s.size === 'string' && s.size.trim()) v.tamano = s.size.trim();
    const precio = numero(s.salePrice) || numero(s.listPrice);
    if (Number.isFinite(precio) && precio > 0) v.precio = precio;
    const imagen = https(s.skuImages?.image250) || https(s.skuImages?.imageUrl);
    if (imagen) v.imagen = imagen;
    try { if (s.targetUrl) v.link = new URL(s.targetUrl, 'https://www.sephora.com').href; } catch { /* sin link */ }
    variantes.push(v);
    if (variantes.length >= MAX_VARIANTES) break;
  }
  return { variantes, dimensiones: [] };
}

// Talla de Michael Kors: "7_dot_5" → "7.5".
const tallaMk = t => String(t ?? '').replace(/_dot_/g, '.').trim();

/**
 * Colores y tallas de un producto de Michael Kors: ProductGroup del JSON-LD de su
 * página (hasVariant: sku numérico, color, size, image, offers). Se exige que el
 * grupo sea del producto pedido (@id …/<ID>.html o productGroupID). El JSON-LD trae
 * también colores retirados, de otros estilos y tallas agotadas sin precio que la
 * página no ofrece: se deja solo lo que la página muestra (swatches de color, cuyo
 * código está en la imagen "<ID>-001-0001_1"; tallas con precio; con un solo color,
 * las tallas de la página). Agrupadas por color en la vista previa.
 */
function variantesMk(html, id) {
  html = String(html || '');
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const pedido = String(id || '').toUpperCase();
  // Swatches de color y opciones de talla de la página.
  const swatches = new Set([...html.matchAll(/data-attr-value="(\d{4})"[^>]*js-swatch-value/g)].map(m => m[1]));
  const tallasPagina = new Set([...html.matchAll(/data-attr-value="([^"]+)"[^>]*name="Size"/g)].map(m => m[1]));
  for (let m; (m = re.exec(html));) {
    let datos;
    try { datos = JSON.parse(m[1]); } catch { continue; }
    for (const g of Array.isArray(datos) ? datos : [datos]) {
      if (g?.['@type'] !== 'ProductGroup' || !Array.isArray(g.hasVariant)) continue;
      const base = String(g['@id'] || '').split('?')[0];
      const propio = base.toUpperCase().endsWith(`/${pedido}.HTML`) || String(g.productGroupID || '').toUpperCase() === pedido;
      if (!propio) return { error: 'la página no es de este producto' };
      const conTalla = g.hasVariant.some(v => tallaMk(v?.size));
      let variantes = [];
      for (const v of g.hasVariant) {
        const sku = String(v?.sku || '').trim();
        if (!sku) continue;
        const oferta = Array.isArray(v.offers) ? v.offers[0] : v.offers;
        const precio = Number(oferta?.price);
        // Agotada y sin precio: tallas que la página no ofrece (5UNA, 9B…).
        if (!(Number.isFinite(precio) && precio > 0) && /OutOfStock/i.test(String(oferta?.availability || ''))) continue;
        const img = Array.isArray(v.image) ? v.image[0] : v.image;
        const imagen = https(typeof img === 'string' ? img : img?.url);
        const cod = imagen.split('/').pop().match(/^([A-Z0-9]+)-\d{3}-(\d{4})_/i);
        // Imagen de otro estilo: otro modelo que el JSON-LD mezcla en el grupo.
        if (cod && cod[1].toUpperCase() !== pedido) continue;
        const color = String(v.color || '').trim() || '—';
        const tallaCruda = String(v.size ?? '').trim();
        const out = { sku, atributos: conTalla ? [color, tallaMk(tallaCruda) || 'Única'] : [color], tallaCruda };
        if (cod) out.codigoColor = cod[2];
        if (Number.isFinite(precio) && precio > 0) out.precio = precio;
        if (imagen) out.imagen = imagen;
        variantes.push(out);
      }
      // Solo los colores con swatch en la página (si la página los trae y se conocen los códigos).
      if (swatches.size && variantes.some(v => v.codigoColor)) variantes = variantes.filter(v => !v.codigoColor || swatches.has(v.codigoColor));
      // Un solo color: sus tallas son las que lista la página.
      if (conTalla && tallasPagina.size && new Set(variantes.map(v => v.atributos[0])).size === 1) {
        const enPagina = variantes.filter(v => tallasPagina.has(v.tallaCruda));
        if (enPagina.length) variantes = enPagina;
      }
      // Link de la página del producto con el color y la talla (los @id de cada SKU redirigen al listado).
      for (const v of variantes) {
        const q = [v.codigoColor && `dwvar_${pedido}_color=${v.codigoColor}`, v.codigoColor && conTalla && v.tallaCruda && `dwvar_${pedido}_size=${encodeURIComponent(v.tallaCruda)}`].filter(Boolean).join('&');
        const link = https(base) ? `${base}${q ? `?${q}` : ''}` : '';
        if (link) v.link = link;
        delete v.tallaCruda;
      }
      // Orden: colores como vienen; tallas de menor a mayor (las no numéricas al final).
      const colores = [...new Set(variantes.map(v => v.atributos[0]))];
      const num = t => { const n = parseFloat(t); return Number.isFinite(n) ? n : Infinity; };
      variantes.sort((a, b) => colores.indexOf(a.atributos[0]) - colores.indexOf(b.atributos[0])
        || (conTalla ? num(a.atributos[1]) - num(b.atributos[1]) || a.atributos[1].localeCompare(b.atributos[1]) : 0));
      const dimensiones = conTalla ? [{ nombre: 'Color', visual: true }, { nombre: 'Talla', visual: false }] : [{ nombre: 'Color', visual: true }];
      return { variantes: variantes.slice(0, MAX_VARIANTES), dimensiones };
    }
  }
  return { error: 'sin datos' };
}

// Atributo de una etiqueta HTML ("" si no está), con las entidades básicas resueltas.
const atributo = (tag, nombre) => {
  const m = tag.match(new RegExp(`\\s${nombre}="([^"]*)"`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : '';
};

/**
 * Página de un producto de Marc Jacobs: sus colores (input colorSelector: código y
 * nombre), el color abierto (checked), las tallas de ese color (botones size-button;
 * las agotadas, deshabilitadas, también se muestran), precio e imagen del JSON-LD y
 * la URL base (canonical). Las tallas de los otros colores no vienen: hay que abrir
 * la página de cada color (variantesMj).
 */
function leerPaginaMj(html, id) {
  html = String(html || '');
  const pedido = String(id || '').toUpperCase();
  const colores = [];
  // Colores de otro modelo que la página muestra en su selector (su pid es otro estilo,
  // p. ej. "The Brushed Satin…" dentro de "The 400 Bleecker Runner"): el sistema crea
  // solo el estilo del Excel, así que no son variantes de este producto.
  const otros = [];
  let abierto = '';
  let propio = false;
  for (const [tag] of html.matchAll(/<input[^>]*name="colorSelector"[^>]*>/gi)) {
    const codigo = atributo(tag, 'value');
    if (!codigo) continue;
    const pid = (atributo(tag, 'data-url').match(/[?&]pid=([^&]+)/i) || [])[1]?.toUpperCase() || '';
    if (pid === pedido) propio = true;
    const color = { codigo, nombre: atributo(tag, 'data-label') || codigo };
    if (pid && pid !== pedido) { if (!otros.some(c => c.codigo === codigo)) otros.push({ ...color, pid }); }
    else if (!colores.some(c => c.codigo === codigo)) colores.push(color);
    if (/\schecked(\s|=|>|\/)/i.test(tag) && (!pid || pid === pedido)) abierto = codigo;
  }
  let precio = NaN;
  let imagen = '';
  for (const [, json] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let d;
    try { d = JSON.parse(json); } catch { continue; }
    for (const x of Array.isArray(d) ? d : [d]) {
      if (x?.['@type'] !== 'Product') continue;
      if (String(x.mpn || '').toUpperCase() === pedido) propio = true;
      const oferta = Array.isArray(x.offers) ? x.offers[0] : x.offers;
      precio = Number(oferta?.price);
      const img = Array.isArray(x.image) ? x.image[0] : x.image;
      imagen = https(typeof img === 'string' ? img : img?.url);
    }
  }
  if (!colores.length && !propio) return { error: 'sin datos' };
  if (!propio) return { error: 'la página no es de este producto' };
  const tallas = [];
  // Tamaños de otro modelo (bolsos: SMALL y LARGE son estilos distintos, cada botón
  // lleva el pid del suyo): no son tallas de este producto.
  const otrasTallas = [];
  for (const [tag] of html.matchAll(/<button[^>]*size-button[^>]*>/gi)) {
    const valor = atributo(tag, 'value');
    const url = atributo(tag, 'data-url');
    if (!valor || (abierto && !new RegExp(`_color=${abierto}(&|$)`).test(url))) continue;
    // Nombre visible: el title ("LARGE", "35 out of stock") sin el aviso; si no, el value ("1SZ").
    const nombre = atributo(tag, 'title').replace(/out of stock/i, '').trim() || valor;
    const pid = (url.match(/[?&]pid=([^&]+)/i) || [])[1]?.toUpperCase() || '';
    if (pid && pid !== pedido) { if (!otrasTallas.some(t => t.nombre === nombre && t.pid === pid)) otrasTallas.push({ nombre, pid }); continue; }
    if (tallas.some(t => t.valor === valor)) continue;
    tallas.push({ valor, nombre, agotada: /size-disabled/.test(atributo(tag, 'class')) || /out of stock/i.test(atributo(tag, 'title')) });
  }
  // Precio de la página (el de oferta, no el tachado): el JSON-LD puede quedarse con el
  // de otro modelo tras cambiar de color en la pestaña, y no trae las rebajas.
  const zona = html.slice(Math.max(0, html.indexOf('class="price-wrapper"')), html.indexOf('class="price-wrapper"') + 1500);
  const deOferta = [...zona.matchAll(/<span([^>]*)content="([\d.]+)"/g)].find(m => !/price-strike/.test(m[1]));
  if (html.includes('class="price-wrapper"') && deOferta) precio = Number(deOferta[2]);
  const canonical = (html.match(/<link[^>]*rel="canonical"[^>]*>/i) || [''])[0];
  const base = https(atributo(canonical, 'href').split('?')[0]);
  return { colores, otros, otrasTallas, abierto, tallas, precio, imagen, base };
}

/**
 * Colores y tallas de un producto de Marc Jacobs: la página del producto y, con una
 * pausa entre descargas, la de cada uno de sus otros colores (cada página trae solo
 * las tallas de su color). Un bloqueo corta todo; otro error deja ese color sin tallas.
 */
async function variantesMj(p) {
  const id = String(p?.asin || '').toUpperCase();
  const bajar = async url => {
    let res;
    try { res = await fetch(url, { credentials: 'include' }); } catch (e) { return { error: `sin conexión (${e.message || e})` }; }
    const html = await res.text().catch(() => '');
    if (!res.ok) return res.status === 403 || /<title>\s*Access Denied/i.test(html) ? { error: 'captcha' } : { error: `HTTP ${res.status}` };
    return leerPaginaMj(html, id);
  };
  const primera = await bajar(p.link);
  if (primera.error) return primera;
  const { colores } = primera;
  // URL del producto: la del link sin el color (…/<ID>-707.html → …/<ID>.html); el
  // canonical puede ser de otro estilo (la página de un color de otro modelo lo cambia).
  const delLink = String(p.link || '').split('?')[0].replace(new RegExp(`/${id}-[^/]*\\.html$`, 'i'), `/${id}.html`);
  const esDelProducto = u => new RegExp(`/${id}\\.html$`, 'i').test(u || '');
  const base = https(delLink) && esDelProducto(delLink) ? delLink : esDelProducto(primera.base) ? primera.base : https(delLink);
  const porColor = new Map([[primera.abierto, primera]]);
  for (const c of colores) {
    if (porColor.has(c.codigo)) continue;
    if (!base) { porColor.set(c.codigo, { tallas: [] }); continue; }
    await new Promise(r => setTimeout(r, globalThis.__cfFamilias.pausa({})));
    const r = await bajar(`${base}?dwvar_${id}_color=${encodeURIComponent(c.codigo)}`);
    if (r.error === 'captcha') return r;
    // Otro error, o la página abrió otro color: ese color queda sin tallas.
    porColor.set(c.codigo, r.error || r.abierto !== c.codigo ? { tallas: [] } : r);
  }
  const lista = colores.length ? colores : [{ codigo: primera.abierto, nombre: primera.abierto || '—' }];
  const variantes = [];
  for (const c of lista) {
    const d = porColor.get(c.codigo) || { tallas: [] };
    const precio = Number.isFinite(d.precio) && d.precio > 0 ? d.precio : primera.precio;
    // La imagen de cada color: la del JSON-LD con el código del color (…/NRF/449/…).
    // (…/Product_Style_Code/<ID>/NRF/<color>/…; el estilo también, por si el JSON-LD es de otro modelo).
    const patron = /\/Product_Style_Code\/[^/]+\/NRF\/[^/]+\//;
    const imagen = patron.test(primera.imagen || '')
      ? primera.imagen.replace(patron, `/Product_Style_Code/${encodeURIComponent(id)}/NRF/${encodeURIComponent(c.codigo)}/`)
      : d.imagen || primera.imagen;
    const tallas = d.tallas.length ? d.tallas : [{ valor: '—' }];
    for (const t of tallas) {
      const v = { sku: `${c.codigo}-${t.valor}`, atributos: [c.nombre, t.nombre || t.valor], codigoColor: c.codigo };
      if (t.agotada) v.agotada = true;
      if (Number.isFinite(precio) && precio > 0) v.precio = precio;
      if (https(imagen)) v.imagen = imagen;
      if (base) v.link = `${base}?dwvar_${id}_color=${encodeURIComponent(c.codigo)}${t.valor !== '—' ? `&dwvar_${id}_size=${encodeURIComponent(t.valor)}` : ''}`;
      variantes.push(v);
    }
  }
  const otros = primera.otros || [];
  const otrasTallas = primera.otrasTallas || [];
  const frase = (lista, uno, varios) => `${lista.length === 1 ? uno : varios} ${lista.map(c => c.nombre).join(', ')} de otro modelo (${[...new Set(lista.map(c => c.pid))].join(', ')})`;
  const partes = [otrasTallas.length ? frase(otrasTallas, 'el tamaño', 'los tamaños') : '', otros.length ? frase(otros, 'el color', 'los colores') : ''].filter(Boolean);
  const total = otros.length + otrasTallas.length;
  const nota = partes.length
    ? `La página muestra también ${partes.join(' y ')}: no ${total === 1 ? 'es variante' : 'son variantes'} de este producto.`
    : '';
  // Lo mismo, en corto, para la celda de un producto sin otras variantes.
  const aparte = [...otrasTallas.map(t => ({ tipo: 'talla', ...t })), ...otros.map(c => ({ tipo: 'color', nombre: c.nombre, pid: c.pid }))];
  return { variantes: variantes.slice(0, MAX_VARIANTES), dimensiones: [{ nombre: 'Color', visual: true }, { nombre: 'Talla', visual: false }], ...(nota ? { nota } : {}), ...(aparte.length ? { aparte } : {}) };
}

// Orden de tallas de ropa y calzado: "00" antes de "0", números de menor a mayor,
// letras XXS…XXL; lo demás al final en el orden en que viene.
const LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '1X', '2X', '3X'];
const ordenTalla = t => {
  const s = String(t || '').trim().toUpperCase();
  if (s === '00') return -1;
  const n = parseFloat(s);
  if (Number.isFinite(n) && /^[\d.]+$/.test(s)) return n;
  const i = LETRAS.indexOf(s);
  return i >= 0 ? 1000 + i : Infinity;
};

/**
 * Colores y tallas de una familia de Kate Spade: ProductGroup del JSON-LD de la página
 * del producto (hasVariant: sku "KP145 Z1P  0", color, size, image, offers). Se exige
 * que la familia incluya el estilo pedido. Si la familia reúne varios estilos, el
 * color lleva su estilo (dos estilos pueden tener el mismo color). Agrupadas por color.
 */
function variantesKs(html, id) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const pedido = estilo(id);
  for (let m; (m = re.exec(String(html || '')));) {
    let datos;
    try { datos = JSON.parse(m[1]); } catch { continue; }
    for (const g of Array.isArray(datos) ? datos : [datos]) {
      if (g?.['@type'] !== 'ProductGroup' || !Array.isArray(g.hasVariant)) continue;
      const estilos = [...new Set(g.hasVariant.map(v => estilo(v?.sku || v?.productID || v?.mpn)).filter(Boolean))];
      if (!estilos.includes(pedido) && estilo(g.productGroupID) !== pedido) return { error: 'la página no es de este producto' };
      const conTalla = g.hasVariant.some(v => String(v?.size ?? '').trim());
      // Un solo color (p. ej. un abrigo con solo tallas): las variantes no traen color
      // ni imagen; el grupo sí ("color" e "image"). Solo vale si la familia es de un estilo.
      const unEstilo = estilos.length <= 1;
      const colorGrupo = unEstilo ? String(g.color || '').trim() : '';
      const imgGrupo = Array.isArray(g.image) ? g.image[0] : g.image;
      const imagenGrupo = unEstilo ? https(typeof imgGrupo === 'string' ? imgGrupo : imgGrupo?.url) : '';
      const variantes = [];
      for (const v of g.hasVariant) {
        const sku = String(v?.sku || v?.productID || v?.mpn || '').trim();
        if (!sku) continue;
        // Sin color en la variante ni en el grupo: '—' sin el estilo, que la vista previa oculta.
        const nombreColor = String(v.color || '').trim() || colorGrupo;
        const color = nombreColor ? nombreColor + (estilos.length > 1 ? ` (${estilo(sku)})` : '') : '—';
        const out = { sku, atributos: conTalla ? [color, String(v.size ?? '').trim() || 'Única'] : [color] };
        const oferta = Array.isArray(v.offers) ? v.offers[0] : v.offers;
        const precio = Number(oferta?.price);
        if (Number.isFinite(precio) && precio > 0) out.precio = precio;
        if (/OutOfStock/i.test(String(oferta?.availability || ''))) out.agotada = true;
        const img = Array.isArray(v.image) ? v.image[0] : v.image;
        const imagen = https(typeof img === 'string' ? img : img?.url) || imagenGrupo;
        if (imagen) out.imagen = imagen;
        const link = https(oferta?.url) || https(v['@id']) || https(v.url);
        if (link) out.link = link;
        variantes.push(out);
      }
      const colores = [...new Set(variantes.map(v => v.atributos[0]))];
      variantes.sort((a, b) => colores.indexOf(a.atributos[0]) - colores.indexOf(b.atributos[0])
        || (conTalla ? (ordenTalla(a.atributos[1]) - ordenTalla(b.atributos[1])) || 0 : 0));
      const dimensiones = conTalla ? [{ nombre: 'Color', visual: true }, { nombre: 'Talla', visual: false }] : [{ nombre: 'Color', visual: true }];
      return { variantes: variantes.slice(0, MAX_VARIANTES), dimensiones };
    }
  }
  return { error: 'sin datos' };
}

// LECTORES leen la página del producto; DESCARGADORES descargan por su cuenta (varias páginas).
const LECTORES = { Sephora: variantesSephora, 'Michael Kors': variantesMk, 'Kate Spade': variantesKs };
const DESCARGADORES = { 'Marc Jacobs': variantesMj };
export const leeVariantes = p => !!(LECTORES[p?.ecomerce] || DESCARGADORES[p?.ecomerce]);

/**
 * Descarga la página del producto (`p.link`) y lee sus variantes. Nunca lanza error:
 * { variantes, dimensiones } o { error }.
 */
export async function descargarVariantes(p) {
  if (DESCARGADORES[p?.ecomerce]) {
    try { return await DESCARGADORES[p.ecomerce](p); } catch (e) { return { error: String(e.message || e) }; }
  }
  const lector = LECTORES[p?.ecomerce];
  if (!lector) return { error: 'el sitio no tiene variantes' };
  let res;
  try {
    res = await fetch(p.link, { credentials: 'include' });
  } catch (e) {
    return { error: `sin conexión (${e.message || e})` };
  }
  const html = await res.text().catch(() => '');
  if (!res.ok) return res.status === 403 || /<title>\s*Access Denied/i.test(html) ? { error: 'captcha' } : { error: `HTTP ${res.status}` };
  return lector(html, p.asin);
}
