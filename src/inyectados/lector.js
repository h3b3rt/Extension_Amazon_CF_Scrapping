// Se inyecta en la pestaña del sitio antes de scraper.js (después de familias.js).
// Registra globalThis.__cfLector(config): la lectura de un producto según la
// configuración del sitio (layouts y selectores, posiblemente remota): SKU y link,
// precio, imagen, marca, anuncios a omitir (parseItem) y el tipo de página. No guarda
// nada entre extracciones: cada llamada arma un lector nuevo.
// scraper.js lleva el flujo (límites, páginas siguientes, familias, avisos) y usa lo
// que devuelve este lector; `estado` es lo que los dos leen y cambian durante una
// extracción (marca de la página, modo "leer al bajar" y productos sin SKU).
//
// Script clásico, sin import/export, como scraper.js y familias.js.
globalThis.__cfLector = function (config) {
  let SKU_RE = /^[A-Z0-9]{10}$/;
  try { if (config.skuPattern) SKU_RE = new RegExp(config.skuPattern); } catch { /* patrón remoto inválido */ }
  const list = v => (Array.isArray(v) ? v : v ? [v] : []);
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  // Un selector remoto inválido no debe romper la extracción completa.
  const qs = (root, sel) => { try { return sel ? root.querySelector(sel) : null; } catch { return null; } };
  const qsa = (root, sel) => { try { return sel ? [...root.querySelectorAll(sel)] : []; } catch { return []; } };
  const firstEl = (root, selectors) => {
    for (const sel of list(selectors)) { const el = qs(root, sel); if (el) return el; }
    return null;
  };
  const firstValue = (root, selectors, read) => {
    for (const sel of list(selectors)) {
      const el = qs(root, sel);
      const v = el ? (read(el) || '').trim() : '';
      if (v) return v;
    }
    return '';
  };

  // Con skuPattern propio el SKU se respeta tal cual; el ASIN de Amazon va en mayúsculas.
  const valid = v => { v = (v || '').trim(); if (!config.skuPattern) v = v.toUpperCase(); return SKU_RE.test(v) ? v : ''; };
  const absolute = href => { try { return new URL(href, location.href).href; } catch { return ''; } };
  const sinParametros = url => { try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return ''; } };

  // Modelo base del SKU, igual que el backend (Marc Jacobs: normalizeSku): corta en
  // el primer `cutAt` (uno o varios: Kate Spade "-", "%20" y espacio), mayúsculas y
  // quita lo que cumpla `strip`.
  // "h001m01sp21-001" → "H001M01SP21": los colores de un modelo son un solo producto.
  function base(v) {
    const B = config.skuBase || {};
    v = String(v || '').trim();
    for (const c of list(B.cutAt)) v = v.split(c)[0];
    v = v.toUpperCase();
    try { if (B.strip) v = v.replace(new RegExp(B.strip, 'g'), ''); } catch { return ''; }
    return valid(v);
  }
  // SKU tal como venía (con color), para contar los colores agrupados en un modelo.
  let crudo = '';

  // SKU dentro de un enlace. Con skuFromLink (p. ej. Michael Kors: "/<ID>.html")
  // se busca solo en la ruta, igual que el backend; si no, el /dp/ASIN de Amazon.
  // Con `aBase`, el modelo base del ID (ver base()).
  function skuFromUrl(url, aBase = false) {
    if (!url) return '';
    if (config.skuFromLink) {
      try {
        const id = new URL(url, location.href).pathname.match(new RegExp(config.skuFromLink, 'i'))?.[1];
        if (!aBase) return valid(id);
        crudo = (id || '').toUpperCase();
        return base(id);
      } catch { return ''; }
    }
    let u = url;
    try { u = decodeURIComponent(url); } catch { /* URL mal codificada: usar tal cual */ }
    const m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : '';
  }

  // Producto con variante (p. ej. Sephora: ID "P123456" y skuId de la variante en
  // atributos). Link limpio: la ruta del enlace (o de la página) sin parámetros, más
  // la variante en `variantParam`. Si linkCheck no encuentra el mismo ID en la ruta
  // (el backend toma la primera coincidencia), el producto se omite.
  function variantLink(item, layout, asin) {
    const a = item.matches?.('a[href]') ? item : firstEl(item, layout.link);
    return armarLink(a ? a.getAttribute('href') : location.href, asin,
      item.getAttribute(config.variant?.attr || '') || variantFromChild(item, layout));
  }

  // Respaldo (v1.12.1): producto de un solo SKU sin el atributo de la variante (Sephora:
  // el <main> no trae data-cnstrc-item-variation-id). Se lee del texto de un elemento
  // del producto (`variantChild`, "Item 3031002") con `variantChildText` (grupo 1).
  function variantFromChild(item, layout) {
    if (!layout.variantChild) return '';
    let re;
    try { re = new RegExp(layout.variantChildText || '(\\d+)'); } catch { return ''; }
    return firstValue(item, layout.variantChild, el => text(el).match(re)?.[1] || '');
  }

  // Link limpio con la variante (ver variantLink); también para los datos JSON de la página.
  function armarLink(href, asin, variante) {
    const V = config.variant || {};
    variante = (variante || '').trim();
    if (!variante || !V.param) return null;
    try { if (V.pattern && !new RegExp(V.pattern).test(variante)) return null; } catch { return null; }
    let u;
    try { u = new URL(href || location.href, location.href); } catch { return null; }
    if (V.origin) { try { u = new URL(u.pathname, V.origin); } catch { return null; } }
    for (const p of list(V.pathStrip)) {
      try { u.pathname = u.pathname.replace(new RegExp(p, 'i'), ''); } catch { /* patrón remoto inválido */ }
    }
    u.search = '';
    u.hash = '';
    u.searchParams.set(V.param, variante);
    if (V.linkCheck) {
      let m = null;
      try { m = u.pathname.match(new RegExp(V.linkCheck, 'i')); } catch { return null; }
      if (m?.[1]?.toUpperCase() !== asin.toUpperCase()) return null;
    }
    return { url: u.href, variante };
  }

  // { asin, url }: el SKU y, si salió de un enlace, ese enlace (para el link del Excel).
  // Fuentes "…Base" (Marc Jacobs): el modelo base del ID (ver base()); las versiones
  // anteriores no las conocen, así que en ellas el sitio no extrae nada.
  // "linkEstilo"/"urlEstilo" (Kate Spade, v1.11.0): lo mismo que linkBase/urlBase, con
  // otro nombre para que las versiones anteriores (sin familias de Kate Spade) no extraigan.
  const FUENTE = { linkEstilo: 'linkBase', urlEstilo: 'urlBase' };

  // Link del modelo abierto cuando no es el de la URL: el de la página (`linkChild`,
  // atributo `linkChildAttr`; si es JSON, su clave `linkChildKey`) si es de ese modelo;
  // si no, la URL con el ID cambiado en la ruta (…/<ID>.html).
  function linkDelModelo(item, layout, modelo) {
    for (const el of list(layout.linkChild).flatMap(sel => qsa(document, sel))) {
      let v = el.getAttribute(layout.linkChildAttr || 'value') || '';
      if (layout.linkChildKey) { try { v = JSON.parse(v)?.[layout.linkChildKey] || ''; } catch { v = ''; } }
      const url = sinParametros(absolute(String(v)));
      if (url && skuFromUrl(url, true) === modelo) return url;
    }
    const url = sinParametros(location.href).replace(/\/[^/]+\.html$/i, `/${modelo}.html`);
    return skuFromUrl(url, true) === modelo ? url : '';
  }
  function findAsin(item, layout) {
    for (const fuente of list(layout.asinFrom || ['attr', 'child', 'csaItemId', 'link'])) {
      const source = FUENTE[fuente] || fuente;
      let asin = '';
      let url = '';
      crudo = '';
      // El link queda sin parámetros (?dwvar_…): el backend no lo lee, es solo referencia.
      if (source === 'linkBase') {
        for (const sel of list(layout.link)) {
          url = sinParametros(absolute(qs(item, sel)?.getAttribute('href') || ''));
          asin = skuFromUrl(url, true);
          if (asin) return { asin, url, crudo };
        }
        continue;
      }
      if (source === 'urlBase') {
        asin = skuFromUrl(location.href, true);
        if (!asin) continue;
        url = sinParametros(location.href);
        // Página que reúne varios modelos (Marc Jacobs: "Scene Large Bucket" muestra
        // también los colores del Small): al elegir un color del otro modelo la página
        // cambia sin cambiar la URL. Manda el modelo abierto (skuChild) y su propio link.
        const v = layout.skuChild ? firstValue(item, layout.skuChild, el => el.getAttribute(layout.skuAttr || 'data-pid')) : '';
        const abierto = base(v);
        if (abierto && abierto !== asin) {
          const original = crudo;
          const propio = linkDelModelo(item, layout, abierto);
          crudo = original;
          if (propio) return { asin: abierto, url: propio, crudo: v.toUpperCase() };
        }
        return { asin, url, crudo };
      }
      // Atributo de un elemento del producto (p. ej. data-product-id del botón de favoritos).
      if (source === 'childBase') {
        const v = firstValue(item, layout.skuChild, el => el.getAttribute(layout.skuAttr || 'data-pid'));
        asin = base(v);
        if (asin) return { asin, url: sinParametros(location.href), crudo: v.toUpperCase() };
        continue;
      }
      if (source === 'variant') {
        asin = valid(item.getAttribute(layout.skuAttr || ''));
        const v = asin ? variantLink(item, layout, asin) : null;
        if (v) return { asin, ...v };
        continue;
      }
      if (source === 'attr') asin = valid(item.getAttribute(layout.skuAttr || 'data-asin'));
      else if (source === 'child') asin = valid(qs(item, '[data-asin]:not([data-asin=""])')?.getAttribute('data-asin'));
      // Página de producto: campo oculto del formulario de compra (variante seleccionada).
      else if (source === 'input') asin = valid(firstValue(item, layout.asinInput, el => el.value || el.getAttribute('value')));
      else if (source === 'url') { url = location.href; asin = skuFromUrl(url); }
      else if (source === 'canonical') { url = absolute(qs(document, 'link[rel="canonical"]')?.getAttribute('href') || ''); asin = skuFromUrl(url); }
      else if (source === 'csaItemId') {
        const m = (item.getAttribute('data-csa-c-item-id') || '').match(/amzn1\.asin\.([A-Z0-9]{10})/i);
        asin = m ? m[1].toUpperCase() : '';
      } else if (source === 'link') {
        for (const sel of list(layout.link)) {
          url = absolute(qs(item, sel)?.getAttribute('href') || '');
          asin = skuFromUrl(url);
          if (asin) break;
        }
      }
      if (asin) return { asin, url };
    }
    return null;
  }

  function parseAmount(str) {
    const m = (str || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    return m ? m[1] : '';
  }

  function joinPrice(wholeEl, fractionEl) {
    const whole = text(wholeEl).replace(/\D/g, '');
    if (!whole) return '';
    const frac = (text(fractionEl).replace(/\D/g, '') || '00').padEnd(2, '0').slice(0, 2);
    return `${whole}.${frac}`;
  }

  // Precio en un atributo del producto: "$7.50", "98.00" o un rango
  // "107.00 - $205.00" (se usa el promedio; es solo referencia).
  function priceFromAttr(str) {
    const nums = (str || '').replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/g) || [];
    if (nums.length > 1 && /\d\s*[-–]\s*\$?\s*\d/.test(str)) return ((+nums[0] + +nums[1]) / 2).toFixed(2);
    return nums[0] || '';
  }

  function getPrice(card, layout) {
    if (layout.priceAttr) { const p = priceFromAttr(card.getAttribute(layout.priceAttr)); if (p) return p; }
    const P = config.price || {};
    // Con priceRoot el precio solo se busca en ese bloque (p. ej. el de compra en
    // la página de producto), nunca en accesorios ni sugerencias. Sin bloque: sin precio.
    const item = layout.priceRoot ? firstEl(card, layout.priceRoot) : card;
    if (!item) return '';
    // 0. Precio en el atributo `content` (schema.org; Marc Jacobs: el de venta, no el tachado).
    for (const sel of list(layout.priceContent)) { const p = parseAmount(qs(item, sel)?.getAttribute('content')); if (p) return p; }
    // 1. Precio específico del layout (p. ej. Price__whole / Price__fractional).
    const lw = firstEl(item, layout.priceWhole);
    if (lw) { const p = joinPrice(lw, firstEl(item, layout.priceFraction)); if (p) return p; }
    // 2. Bloque estándar .a-price (ignorando el precio tachado).
    for (const sel of list(P.offscreen)) { const p = parseAmount(text(qs(item, sel))); if (p) return p; }
    const w = qs(item, P.whole);
    if (w) { const p = joinPrice(w, qs(item, P.fraction)); if (p) return p; }
    if (P.attr) {
      const el = qs(item, `[${P.attr}]`);
      const p = parseAmount(el?.getAttribute(P.attr));
      if (p) return p;
    }
    // 3. Último recurso: primer "$123.45" dentro de elementos de precio.
    for (const sel of list(layout.priceText)) {
      for (const el of qsa(item, sel)) {
        const m = text(el).replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
        if (m) return m[1];
      }
    }
    return '';
  }

  // Dominios de imagen válidos del sitio (por defecto, los de Amazon).
  const imageHosts = list(config.image?.hosts).length ? list(config.image.hosts) : ['media-amazon\\.com/images/', 'images-amazon\\.com'];
  const isImageUrl = url => imageHosts.some(h => { try { return new RegExp(h, 'i').test(url); } catch { return false; } });

  function getImage(img) {
    if (!img) return '';
    const candidates = [];
    const add = (url, resolution = 0, priority = 0) => {
      if (!url) return;
      url = url.trim().replace(/^["']|["']$/g, '');
      // Los marcadores de carga diferida (data:image/…) no pasan este filtro.
      if (!/^https?:\/\//i.test(url)) return;
      if (!isImageUrl(url)) return;
      candidates.push({ url, resolution, priority });
    };
    const addSrcset = (srcset, priority = 0) => {
      if (!srcset) return;
      srcset.trim().split(/,\s*(?=https?:\/\/)/i).forEach(entry => {
        const m = entry.trim().match(/^(https?:\/\/.+?)(?:\s+([\d.]+)(w|x))?$/);
        if (!m) return;
        const n = parseFloat(m[2]) || 0;
        add(m[1].trim(), m[3] === 'w' ? n : m[3] === 'x' ? n * 1000 : 0, priority);
      });
    };

    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source').forEach(source => {
        const type = (source.getAttribute('type') || '').toLowerCase();
        const priority = /jpe?g/.test(type) ? 5 : type.includes('webp') ? 4 : type.includes('avif') ? 2 : 3;
        addSrcset(source.getAttribute('srcset') || source.getAttribute('data-srcset'), priority);
      });
    }
    addSrcset(img.getAttribute('srcset'), 5);
    addSrcset(img.getAttribute('data-srcset'), 5);
    const dynamic = img.getAttribute('data-a-dynamic-image');
    if (dynamic) {
      try {
        Object.entries(JSON.parse(dynamic)).forEach(([url, d]) => add(url, Array.isArray(d) ? Number(d[0]) || 0 : 0, 6));
      } catch { /* JSON inválido: ignorar */ }
    }
    add(img.getAttribute('data-old-hires'), 5000, 7);
    add(img.getAttribute('data-src'), 0, 1);
    add(img.getAttribute('src'), 0, 1);
    if (!candidates.length) return '';

    const unique = new Map();
    for (const c of candidates) {
      const e = unique.get(c.url);
      if (!e || c.priority > e.priority || (c.priority === e.priority && c.resolution > e.resolution)) unique.set(c.url, c);
    }
    return ajustarImagen([...unique.values()].sort((a, b) => b.resolution - a.resolution || b.priority - a.priority)[0].url);
  }

  // Tamaño grande de la imagen según el sitio.
  function ajustarImagen(best) {
    if (!best || !isImageUrl(best)) return '';
    // "…/I/71abc._AC_UL320_.jpg" -> "…/I/71abc.jpg" (imagen original en alta resolución)
    if (config.image?.fullSize) best = best.replace(/\._[^/]+?_\.(jpe?g|png|webp|gif)$/i, '.$1');
    // Reemplazos del sitio, p. ej. "/ECOM_Image_Medium/" -> "/ECOM_Image_Large/".
    for (const [from, to] of list(config.image?.replace)) {
      try { best = best.replace(new RegExp(from, 'i'), to ?? ''); } catch { /* patrón remoto inválido */ }
    }
    return best;
  }

  // Imagen armada desde el link del producto, para las tarjetas que aún no la
  // dibujaron (Kate Spade crea el <img> al verse la tarjeta, y nunca en las páginas
  // descargadas): image.fromLink = { pattern, template } con {1}, {2}… del patrón.
  // "/KD120-960.html" → ".../KateSpade/KD120_960".
  function imagenDeLink(url) {
    const I = config.image?.fromLink;
    if (!I?.pattern || !I.template || !url) return '';
    let m = null;
    try { m = new URL(url, location.href).pathname.match(new RegExp(I.pattern, 'i')); } catch { return ''; }
    return m ? ajustarImagen(I.template.replace(/\{(\d)\}/g, (_, i) => m[i] || '')) : '';
  }

  // Marca de la página en las tiendas de marca (/stores/...): está en el
  // breadcrumb, en og:title o en el JSON "brandName" de la página, no en cada
  // tarjeta. Fuera de esas páginas devuelve '' para no inventar una marca.
  function getPageBrand() {
    const P = config.pageBrand;
    if (!P) return '';
    try {
      if (P.urlPattern && !new RegExp(P.urlPattern, 'i').test(location.pathname)) return '';
    } catch { return ''; }
    let strip = null;
    try { strip = P.strip ? new RegExp(P.strip, 'i') : null; } catch { /* regex inválida: no limpiar */ }
    const clean = v => (strip ? (v || '').replace(strip, '') : v || '').replace(/\s+/g, ' ').trim();
    const fromDom = firstValue(document, P.selectors, el => clean(el.getAttribute('content') || el.getAttribute('alt') || text(el)));
    if (fromDom) return fromDom;
    if (P.scriptPattern) {
      try {
        const re = new RegExp(P.scriptPattern);
        for (const s of qsa(document, 'script:not([src])')) {
          const m = (s.textContent || '').match(re);
          if (!m) continue;
          let v = m[1];
          try { v = JSON.parse(`"${v}"`); } catch { /* sin escapes JSON: usar tal cual */ }
          if (clean(v)) return clean(v);
        }
      } catch { /* regex inválida */ }
    }
    return '';
  }

  // "Visit the Apple Store" -> "Apple": primer patrón que coincide (grupo 1).
  function cleanBrand(value, patterns) {
    for (const p of list(patterns)) {
      try {
        const m = value.match(new RegExp(p, 'i'));
        if (m?.[1]?.trim()) return m[1].trim();
      } catch { /* patrón remoto inválido */ }
    }
    return value;
  }

  let marcaPagina = '';
  let sinSku = 0;
  // Al leer mientras se desplaza, un mismo producto sin SKU se ve varias veces:
  // se cuenta una sola vez por su enlace.
  let leerAlBajar = false;
  const fallos = new Set();
  const fallo = item => {
    if (!leerAlBajar) { sinSku++; return; }
    fallos.add(item.getAttribute('href') || firstEl(item, 'a[href]')?.getAttribute('href') || text(item).slice(0, 120));
    sinSku = fallos.size;
  };

  // Tarjetas que no son resultados (anuncios "Sponsored" de Sephora y Amazon):
  // layout.exclude = { self, selector, text } → la tarjeta cumple `self`, o tiene un
  // elemento `selector` (con texto `text`). Se omiten sin contarlas como fallo.
  const excluidos = new Set();
  function excluido(item, layout) {
    const E = layout.exclude;
    if (!E?.selector && !E?.self) return false;
    let re = null;
    try { re = E.text ? new RegExp(E.text, 'i') : null; } catch { return false; }
    let propio = false;
    try { propio = !!E.self && item.matches(E.self); } catch { /* selector remoto inválido */ }
    if (!propio && !(E.selector && qsa(item, E.selector).some(el => !re || re.test(text(el))))) return false;
    excluidos.add(item.getAttribute(layout.skuAttr || 'href') || item.getAttribute('href') || text(item).slice(0, 120));
    return true;
  }

  function parseItem(item, layout) {
    if (excluido(item, layout)) return null;
    const id = findAsin(item, layout);
    if (!id) { fallo(item); return null; }
    const { asin } = id;
    const nombre = firstValue(item, layout.title, el => el.getAttribute('title') || text(el));
    if (!nombre) return null;
    // Link: plantilla del sitio (Amazon: /dp/{asin}) o el enlace de donde salió el SKU.
    const link = config.productUrl ? config.productUrl.replace('{asin}', asin) : id.url;
    if (!link) { fallo(item); return null; }
    const p = {
      asin,
      nombre,
      // Sin marca segura queda vacía para completarla a mano (no se adivina).
      // brandDefault: sitio de una sola marca (Marc Jacobs), donde la tarjeta no la repite.
      marca: cleanBrand(firstValue(item, layout.brand, text), layout.brandPatterns) || marcaPagina || config.brandDefault || '',
      imagen: getImage(firstEl(item, layout.image)) || imagenDeLink(id.url),
      precio: getPrice(item, layout),
      link,
    };
    if (id.variante) p.variante = id.variante;
    if (id.crudo) p.crudo = id.crudo;
    return p;
  }

  function getPageType() {
    for (const t of list(config.pageTypes)) {
      let byUrl = false;
      try { byUrl = !!t.urlPattern && new RegExp(t.urlPattern, 'i').test(location.pathname); } catch { /* regex inválida */ }
      if (byUrl || firstEl(document, t.selectors)) return t;
    }
    return null;
  }

  const estado = {
    get marcaPagina() { return marcaPagina; }, set marcaPagina(v) { marcaPagina = v; },
    get leerAlBajar() { return leerAlBajar; }, set leerAlBajar(v) { leerAlBajar = v; },
    get sinSku() { return sinSku; }, set sinSku(v) { sinSku = v; },
  };
  return { list, text, qs, qsa, firstEl, firstValue, valid, armarLink, ajustarImagen, priceFromAttr, parseItem, getPageBrand, getPageType, fallos, excluidos, estado };
};
