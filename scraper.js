// Se inyecta en la pestaña del sitio (Amazon, Michael Kors…). Registra una función
// global que recibe la configuración del sitio (layouts y selectores, posiblemente
// remota) y devuelve los productos encontrados. Toda la lógica específica de cada
// layout vive en la configuración, así que un cambio de HTML se corrige sin
// publicar una nueva versión de la extensión.
//
// El SKU se guarda en el campo `asin` (nombre heredado de cuando solo había Amazon).
globalThis.__cfScraper = async function (config, options = {}) {
  let SKU_RE = /^[A-Z0-9]{10}$/;
  try { if (config.skuPattern) SKU_RE = new RegExp(config.skuPattern); } catch { /* patrón remoto inválido */ }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
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

  // SKU dentro de un enlace. Con skuFromLink (p. ej. Michael Kors: "/<ID>.html")
  // se busca solo en la ruta, igual que el backend; si no, el /dp/ASIN de Amazon.
  function skuFromUrl(url) {
    if (!url) return '';
    if (config.skuFromLink) {
      try { return valid(new URL(url, location.href).pathname.match(new RegExp(config.skuFromLink, 'i'))?.[1]); } catch { return ''; }
    }
    let u = url;
    try { u = decodeURIComponent(url); } catch { /* URL mal codificada: usar tal cual */ }
    const m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : '';
  }

  // { asin, url }: el SKU y, si salió de un enlace, ese enlace (para el link del Excel).
  function findAsin(item, layout) {
    for (const source of list(layout.asinFrom || ['attr', 'child', 'csaItemId', 'link'])) {
      let asin = '';
      let url = '';
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

  function getPrice(card, layout) {
    const P = config.price || {};
    // Con priceRoot el precio solo se busca en ese bloque (p. ej. el de compra en
    // la página de producto), nunca en accesorios ni sugerencias. Sin bloque: sin precio.
    const item = layout.priceRoot ? firstEl(card, layout.priceRoot) : card;
    if (!item) return '';
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
    let best = [...unique.values()].sort((a, b) => b.resolution - a.resolution || b.priority - a.priority)[0].url;
    // "…/I/71abc._AC_UL320_.jpg" -> "…/I/71abc.jpg" (imagen original en alta resolución)
    if (config.image?.fullSize) best = best.replace(/\._[^/]+?_\.(jpe?g|png|webp|gif)$/i, '.$1');
    // Reemplazos del sitio, p. ej. "/ECOM_Image_Medium/" -> "/ECOM_Image_Large/".
    for (const [from, to] of list(config.image?.replace)) {
      try { best = best.replace(new RegExp(from, 'i'), to ?? ''); } catch { /* patrón remoto inválido */ }
    }
    return best;
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

  function parseItem(item, layout) {
    const id = findAsin(item, layout);
    if (!id) { sinSku++; return null; }
    const { asin } = id;
    const nombre = firstValue(item, layout.title, el => el.getAttribute('title') || text(el));
    if (!nombre) return null;
    // Link: plantilla del sitio (Amazon: /dp/{asin}) o el enlace de donde salió el SKU.
    const link = config.productUrl ? config.productUrl.replace('{asin}', asin) : id.url;
    if (!link) { sinSku++; return null; }
    return {
      asin,
      nombre,
      // Sin marca segura queda vacía para completarla a mano (no se adivina).
      marca: cleanBrand(firstValue(item, layout.brand, text), layout.brandPatterns) || marcaPagina,
      imagen: getImage(firstEl(item, layout.image)),
      precio: getPrice(item, layout),
      link,
    };
  }

  // Avance de la carga, para el popup (si está abierto).
  function report(cargados, limite) {
    try { chrome.runtime.sendMessage({ type: 'scrapeProgress', cargados: Math.min(cargados, limite), limite }).catch(() => {}); } catch { /* popup cerrado */ }
  }

  // Pulsa "Load More" hasta tener `limite` productos o hasta que no haya botón.
  // Si el botón deja de cargar productos, se queda con lo cargado y avisa.
  async function loadMore(L, limite) {
    const count = () => qsa(document, L.item).length;
    // Visible de verdad (offsetParent): Michael Kors tiene un botón para escritorio y otro para móvil, ocultos por CSS.
    const visible = b => !b.disabled && !b.closest('[hidden]') && (b.offsetParent !== null || b.getClientRects().length > 0);
    let n = count();
    let clics = 0;
    report(n, limite);
    while (n < limite && clics < (Number(L.maxClicks) || 100)) {
      const btn = list(L.button).flatMap(sel => qsa(document, sel)).find(visible);
      if (!btn) break;
      btn.scrollIntoView?.({ block: 'center' });
      btn.click();
      clics++;
      const inicio = Date.now();
      let m = count();
      while (m <= n && Date.now() - inicio < (Number(L.timeoutMs) || 15000)) {
        await sleep(250);
        m = count();
      }
      if (m <= n) return { cargados: n, limite, clics, aviso: `"Load More" dejó de responder: se extrajo lo cargado (${n}).` };
      n = m;
      report(n, limite);
      await sleep(Number(L.delayMs) || 400);
    }
    return { cargados: Math.min(n, limite), limite, clics, aviso: '' };
  }

  // Desplaza la página hasta el final para forzar la carga diferida de productos.
  async function autoScroll({ stepDelayMs = 350, maxSteps = 80 } = {}) {
    const doc = document.documentElement;
    let lastHeight = 0, stable = 0;
    for (let i = 0; i < maxSteps && stable < 3; i++) {
      window.scrollBy(0, window.innerHeight * 0.9);
      await sleep(stepDelayMs);
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 5;
      stable = atBottom && doc.scrollHeight === lastHeight ? stable + 1 : 0;
      lastHeight = doc.scrollHeight;
    }
    window.scrollTo(0, 0);
  }

  // Tipo de página especial (p. ej. la de un solo producto): coincide por la URL
  // o porque existe alguno de sus selectores. En ese caso solo corren sus layouts.
  function getPageType() {
    for (const t of list(config.pageTypes)) {
      let byUrl = false;
      try { byUrl = !!t.urlPattern && new RegExp(t.urlPattern, 'i').test(location.pathname); } catch { /* regex inválida */ }
      if (byUrl || firstEl(document, t.selectors)) return t;
    }
    return null;
  }

  try {
    const tipo = getPageType();
    // Los layouts de un tipo de página no corren en las demás páginas.
    const reservados = new Set(list(config.pageTypes).flatMap(t => list(t.layouts)));
    const activos = (config.layouts || []).filter(l => (tipo ? list(tipo.layouts).includes(l.id) : !reservados.has(l.id)));
    // Listados con "Load More": se carga hasta el límite pedido en lugar de desplazar.
    const limite = Math.floor(Number(options.limit)) || 0;
    const cargaMas = !tipo && config.loadMore?.item && limite > 0 ? await loadMore(config.loadMore, limite) : null;
    if (!cargaMas && options.autoScroll && tipo?.autoScroll !== false) await autoScroll(config.scroll);
    marcaPagina = getPageBrand();
    const productos = [];
    const vistos = new Set();
    const layouts = [];
    for (const layout of activos) {
      const items = qsa(document, layout.item);
      let extraidos = 0;
      for (const item of items) {
        try {
          const p = parseItem(item, layout);
          if (!p || vistos.has(p.asin)) continue;
          vistos.add(p.asin);
          productos.push(p);
          extraidos++;
        } catch (e) {
          console.warn(`[CF Scraper] Error en layout ${layout.id}`, e);
        }
      }
      layouts.push({ id: layout.id, label: layout.label || layout.id, encontrados: items.length, extraidos });
    }
    // Con límite, solo los primeros `limite` productos (en el orden de la página).
    if (cargaMas && productos.length > limite) productos.length = limite;
    console.table(productos.map(p => ({ SKU: p.asin, MARCA: p.marca, NOMBRE: p.nombre, PRECIO: p.precio, IMAGEN: p.imagen })));
    return { productos, layouts, marcaPagina, sinSku, cargaMas, tipoPagina: tipo ? { id: tipo.id, label: tipo.label || tipo.id } : null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
};
