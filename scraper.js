// Se inyecta en la pestaña de Amazon. Registra una función global que recibe la
// configuración (layouts y selectores, posiblemente remota) y devuelve los
// productos encontrados. Toda la lógica específica de cada layout vive en la
// configuración, así que un cambio de HTML en Amazon se corrige sin publicar
// una nueva versión de la extensión.
globalThis.__amazonScraper = async function (config, options = {}) {
  const ASIN_RE = /^[A-Z0-9]{10}$/;
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

  function asinFromUrl(url) {
    if (!url) return '';
    let u = url;
    try { u = decodeURIComponent(url); } catch { /* URL mal codificada: usar tal cual */ }
    const m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : '';
  }

  function findAsin(item, layout) {
    const valid = v => { v = (v || '').trim().toUpperCase(); return ASIN_RE.test(v) ? v : ''; };
    for (const source of list(layout.asinFrom || ['attr', 'child', 'csaItemId', 'link'])) {
      let asin = '';
      if (source === 'attr') asin = valid(item.getAttribute('data-asin'));
      else if (source === 'child') asin = valid(qs(item, '[data-asin]:not([data-asin=""])')?.getAttribute('data-asin'));
      // Página de producto: campo oculto del formulario de compra (variante seleccionada).
      else if (source === 'input') asin = valid(firstValue(item, layout.asinInput, el => el.value || el.getAttribute('value')));
      else if (source === 'url') asin = asinFromUrl(location.pathname);
      else if (source === 'csaItemId') {
        const m = (item.getAttribute('data-csa-c-item-id') || '').match(/amzn1\.asin\.([A-Z0-9]{10})/i);
        asin = m ? m[1].toUpperCase() : '';
      } else if (source === 'link') {
        for (const sel of list(layout.link)) { asin = asinFromUrl(qs(item, sel)?.getAttribute('href')); if (asin) break; }
      }
      if (asin) return asin;
    }
    return '';
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

  function getImage(img) {
    if (!img) return '';
    const candidates = [];
    const add = (url, resolution = 0, priority = 0) => {
      if (!url) return;
      url = url.trim().replace(/^["']|["']$/g, '');
      if (!/^https?:\/\//i.test(url)) return;
      if (!/media-amazon\.com\/images\/|images-amazon\.com/i.test(url)) return;
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
    const best = [...unique.values()].sort((a, b) => b.resolution - a.resolution || b.priority - a.priority)[0].url;
    // "…/I/71abc._AC_UL320_.jpg" -> "…/I/71abc.jpg" (imagen original en alta resolución)
    return config.image?.fullSize ? best.replace(/\._[^/]+?_\.(jpe?g|png|webp|gif)$/i, '.$1') : best;
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

  function parseItem(item, layout) {
    const asin = findAsin(item, layout);
    if (!asin) return null;
    const nombre = firstValue(item, layout.title, el => el.getAttribute('title') || text(el));
    if (!nombre) return null;
    return {
      asin,
      nombre,
      // Sin marca segura queda vacía para completarla a mano (no se adivina).
      marca: cleanBrand(firstValue(item, layout.brand, text), layout.brandPatterns) || marcaPagina,
      imagen: getImage(firstEl(item, layout.image)),
      precio: getPrice(item, layout),
      link: (config.productUrl || 'https://www.amazon.com/dp/{asin}').replace('{asin}', asin),
    };
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
    if (options.autoScroll && tipo?.autoScroll !== false) await autoScroll(config.scroll);
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
          console.warn(`[Amazon Scraper] Error en layout ${layout.id}`, e);
        }
      }
      layouts.push({ id: layout.id, label: layout.label || layout.id, encontrados: items.length, extraidos });
    }
    console.table(productos.map(p => ({ ASIN: p.asin, MARCA: p.marca, NOMBRE: p.nombre, PRECIO: p.precio, IMAGEN: p.imagen })));
    return { productos, layouts, marcaPagina, tipoPagina: tipo ? { id: tipo.id, label: tipo.label || tipo.id } : null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
};
