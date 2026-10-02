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

  // Producto con variante (p. ej. Sephora: ID "P123456" y skuId de la variante en
  // atributos). Link limpio: la ruta del enlace (o de la página) sin parámetros, más
  // la variante en `variantParam`. Si linkCheck no encuentra el mismo ID en la ruta
  // (el backend toma la primera coincidencia), el producto se omite.
  function variantLink(item, layout, asin) {
    const a = item.matches?.('a[href]') ? item : firstEl(item, layout.link);
    return armarLink(a ? a.getAttribute('href') : location.href, asin, item.getAttribute(config.variant?.attr || ''));
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
  function findAsin(item, layout) {
    for (const source of list(layout.asinFrom || ['attr', 'child', 'csaItemId', 'link'])) {
      let asin = '';
      let url = '';
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
      marca: cleanBrand(firstValue(item, layout.brand, text), layout.brandPatterns) || marcaPagina,
      imagen: getImage(firstEl(item, layout.image)),
      precio: getPrice(item, layout),
      link,
    };
    if (id.variante) p.variante = id.variante;
    return p;
  }

  // Límite de la extracción: por páginas (`paginasPedidas`, contando la abierta como
  // la 1) o por productos (`limite`). Con páginas, `limite` es Infinity.
  let porPaginas = false;
  let paginasPedidas = 0;
  const tope = L => Number(L.maxPages) || 10;
  // ¿Pasar a la página siguiente? `pagina` es la que ya se leyó (1 = la abierta).
  const seguir = (n, limite, pagina, L, conTope = true) => (porPaginas
    ? pagina < Math.min(paginasPedidas, tope(L))
    : n < limite && (!conTope || pagina < tope(L)));

  // Productos leídos (en orden), SKUs ya vistos y estadística por layout.
  const productos = [];
  const vistos = new Set();
  let layouts = [];
  const jobId = options.jobId || null;
  const enviar = msg => { try { chrome.runtime.sendMessage({ ...msg, jobId }).catch(() => {}); } catch { /* sin receptor */ } };

  // "Detener y guardar lo leído": el service worker pone esta marca en la pestaña.
  globalThis.__cfDetener = false;
  const detenido = () => globalThis.__cfDetener === true;
  let detenida = false;
  const parar = n => { detenida = true; return `Detenida: se guardó lo leído (${n}).`; };

  // Lo leído se envía cada poco al service worker: si la pestaña se cierra, se guarda.
  let enviados = 0;
  let ultimoParcial = 0;
  function enviarParcial(forzar = false) {
    if (!jobId || productos.length <= enviados || (!forzar && Date.now() - ultimoParcial < 1500)) return;
    enviar({ type: 'scrapePartial', productos: productos.slice(enviados) });
    enviados = productos.length;
    ultimoParcial = Date.now();
  }

  // Avance de la carga, para el popup y el icono.
  function report(cargados, limite, pagina = 1, extra = {}) {
    enviar(porPaginas
      ? { type: 'scrapeProgress', cargados, pagina, paginas: paginasPedidas, ...extra }
      : { type: 'scrapeProgress', cargados: Math.min(cargados, limite), limite, pagina, ...extra });
    enviarParcial();
  }

  // Leer al bajar necesita la pestaña visible (Sephora solo dibuja lo que se ve):
  // con la pestaña oculta se pausa hasta que vuelva a verse.
  async function mientrasOculta(cargados, limite, pagina) {
    if (!document.hidden) return;
    report(cargados, limite, pagina, { pausada: true });
    while (document.hidden && !detenido()) await sleep(500);
    report(cargados, limite, pagina, { pausada: false });
  }

  // Pulsa "Load More" hasta el límite (cada clic cuenta como una página) o hasta
  // que no haya botón. Si el botón deja de cargar productos, se queda con lo cargado y avisa.
  async function loadMore(L, limite) {
    const count = () => qsa(document, L.item).length;
    // Visible de verdad (offsetParent): Michael Kors tiene un botón para escritorio y otro para móvil, ocultos por CSS.
    const visible = b => !b.disabled && !b.closest('[hidden]') && (b.offsetParent !== null || b.getClientRects().length > 0);
    let n = count();
    let clics = 0;
    report(n, limite);
    while (seguir(n, limite, clics + 1, L, false) && clics < (Number(L.maxClicks) || 100)) {
      if (detenido()) return { cargados: n, limite, clics, paginas: clics + 1, aviso: parar(n) };
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
      if (m <= n) return { cargados: n, limite, clics, paginas: clics, aviso: `"Load More" dejó de responder: se extrajo lo cargado (${n}).` };
      n = m;
      report(n, limite, clics + 1);
      await sleep(Number(L.delayMs) || 400);
    }
    return { cargados: Math.min(n, limite), limite, clics, paginas: clics + 1, aviso: '' };
  }

  // Listados virtualizados (Sephora): solo se dibujan los productos cerca de la
  // pantalla, así que se leen en cada paso del desplazamiento. Al final de la
  // página se pulsa el botón de la página siguiente (L.button + L.buttonText)
  // hasta llegar al límite. `leer()` agrega los productos visibles y devuelve el total.
  async function loadByScroll(L, limite, leer) {
    const doc = document.documentElement;
    const stepDelay = Number(L.stepDelayMs) || 400;
    const visible = b => !b.disabled && (b.offsetParent !== null || b.getClientRects().length > 0);
    let textRe = null;
    try { textRe = L.buttonText ? new RegExp(L.buttonText, 'i') : null; } catch { /* patrón remoto inválido */ }
    const boton = () => list(L.button).flatMap(sel => qsa(document, sel)).find(b => visible(b) && (!textRe || textRe.test(text(b))));
    const primero = () => qs(document, L.item)?.getAttribute(L.firstAttr || 'href') || '';
    let n = 0;
    let paginas = 1;
    let aviso = '';
    let alEmpezar = 0;
    window.scrollTo(0, 0);
    await sleep(stepDelay);
    for (;;) {
      let lastHeight = 0, stable = 0;
      for (let i = 0; i < (Number(L.maxSteps) || 200) && stable < (Number(L.stableSteps) || 4); i++) {
        await mientrasOculta(n, limite, paginas);
        if (detenido()) break;
        n = leer();
        report(n, limite, paginas);
        if (n >= limite) break;
        const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 5;
        stable = atBottom && doc.scrollHeight === lastHeight ? stable + 1 : 0;
        lastHeight = doc.scrollHeight;
        window.scrollBy(0, window.innerHeight * 0.75);
        await sleep(stepDelay);
      }
      n = leer();
      report(n, limite, paginas);
      if (detenido()) { aviso = parar(n); break; }
      // Página siguiente recorrida entera sin ningún producto nuevo: no seguir.
      if (paginas > 1 && n === alEmpezar) {
        aviso = `La página ${paginas} no tenía productos nuevos: se extrajo lo cargado (${n}).`;
        break;
      }
      if (!seguir(n, limite, paginas, L)) break;
      const btn = boton();
      if (!btn) break;
      // Página siguiente: cambia la URL (?currentPage=2). No se compara el primer
      // producto: los patrocinados se repiten entre páginas y los primeros no se
      // vacían, así que puede seguir siendo el mismo.
      const url0 = location.href;
      const antes = primero();
      const timeout = Number(L.timeoutMs) || 15000;
      btn.scrollIntoView?.({ block: 'center' });
      btn.click();
      const inicio = Date.now();
      while (location.href === url0 && primero() === antes && Date.now() - inicio < timeout) await sleep(250);
      if (location.href === url0 && primero() === antes) {
        aviso = `"${L.name || 'Show More'}" no cargó la página siguiente: se extrajo lo cargado (${n}).`;
        break;
      }
      // Arriba de la página nueva, esperar a que aparezca algún producto nuevo.
      const nAntes = n;
      while (Date.now() - inicio < timeout) {
        window.scrollTo(0, 0);
        await sleep(250);
        n = leer();
        report(n, limite, paginas + 1);
        if (n > nAntes) break;
      }
      alEmpezar = nAntes;
      paginas++;
      window.scrollTo(0, 0);
      await sleep(stepDelay * 2);
    }
    window.scrollTo(0, 0);
    return { cargados: Math.min(n, limite), limite, paginas, aviso };
  }

  // Descarga una página del mismo sitio (con la sesión del usuario) y la convierte en documento.
  async function descargar(url) {
    const res = await fetch(new URL(url, location.href), { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // Enlace a la página siguiente: atributo `L.nextAttr` (Michael Kors: data-url del
  // botón "Load More") o href (Amazon: "Siguiente").
  const siguienteDe = (doc, L) => firstEl(doc, L.next)?.getAttribute(L.nextAttr || 'href') || '';

  // Listados que se pueden leer sin la pestaña visible: la página siguiente se
  // descarga en segundo plano (misma sesión) y se lee igual, sin navegar. Amazon
  // ("Siguiente" → &page=2) y Michael Kors (data-url de "Load More", 24 por tramo).
  async function loadByFetch(L, limite, leer) {
    let n = leer(document);
    let doc = document;
    let paginas = 1;
    let aviso = '';
    let ultimaUrl = '';
    let nuevos = n;
    report(n, limite);
    while (seguir(n, limite, paginas, L)) {
      if (detenido()) { aviso = parar(n); break; }
      let href = siguienteDe(doc, L);
      // El botón de la página abierta puede no existir aún (se crea al bajar): se busca en la copia del servidor.
      if (!href && paginas === 1 && L.nextAttr) {
        try { href = siguienteDe(await descargar(location.href), L); } catch { /* sin copia: seguir sin botón */ }
      }
      // Sin enlace pero con un tramo completo: el siguiente tramo por su parámetro (start += sz).
      if (!href && ultimaUrl && L.startParam) {
        const u = new URL(ultimaUrl, location.href);
        const sz = Number(u.searchParams.get(L.sizeParam || 'sz')) || 0;
        if (sz && nuevos >= sz) { u.searchParams.set(L.startParam, String((Number(u.searchParams.get(L.startParam)) || 0) + sz)); href = u.href; }
      }
      if (!href) break;
      await sleep(Number(L.delayMs) || 1500);
      try {
        doc = await descargar(href);
        ultimaUrl = href;
      } catch (e) {
        aviso = `No se pudo cargar la página ${paginas + 1} (${e.message}): se extrajo lo cargado (${n}).`;
        break;
      }
      const antes = n;
      n = leer(doc);
      nuevos = n - antes;
      paginas++;
      report(n, limite, paginas);
      // Sin productos nuevos: fin de la lista o una verificación ("captcha") del sitio.
      if (n === antes) {
        aviso = `La página ${paginas} no trajo productos nuevos: se extrajo lo cargado (${n}).`;
        break;
      }
    }
    return { cargados: Math.min(n, limite), limite, paginas, aviso };
  }

  // ---- Datos de la página en JSON (Sephora: script#linkStore con los 60 productos) ----

  // Valor en una ruta "page.*.products": `*` es la primera clave donde sigue la ruta.
  function enRuta(obj, ruta) {
    const partes = String(ruta || '').split('.').filter(Boolean);
    const ir = (o, i) => {
      if (i === partes.length) return o;
      if (o == null || typeof o !== 'object') return undefined;
      if (partes[i] !== '*') return ir(o[partes[i]], i + 1);
      for (const k of Object.keys(o)) { const v = ir(o[k], i + 1); if (v !== undefined) return v; }
      return undefined;
    };
    return ir(obj, 0);
  }
  const primerValor = (obj, rutas) => list(rutas).map(r => enRuta(obj, r)).find(v => v != null && v !== '');

  // { items, total, tamano, pagina } del JSON de un documento, o null.
  function datosJson(doc, J) {
    try {
      const datos = JSON.parse(qs(doc, J.script)?.textContent || 'null');
      const items = enRuta(datos, J.products);
      if (!Array.isArray(items)) return null;
      return { items, total: Number(enRuta(datos, J.total)) || 0, tamano: Number(enRuta(datos, J.pageSize)) || items.length, pagina: Number(enRuta(datos, J.page)) || 0 };
    } catch { return null; }
  }

  let statJson = null;
  function agregarJson(items, J) {
    const F = J.fields || {};
    if (!statJson) { statJson = { id: 'datos', label: 'Datos de la página', encontrados: 0, extraidos: 0 }; layouts.push(statJson); }
    for (const it of items) {
      const id = String(enRuta(it, F.asin) ?? '');
      if (F.excluir && enRuta(it, F.excluir)) { excluidos.add(id); continue; }
      statJson.encontrados++;
      const asin = valid(id);
      const v = asin ? armarLink(enRuta(it, F.link), asin, String(enRuta(it, F.variante) ?? '')) : null;
      const nombre = String(enRuta(it, F.nombre) ?? '').trim();
      if (!v) { fallos.add(id || JSON.stringify(it).slice(0, 80)); sinSku = fallos.size; continue; }
      if (!nombre || vistos.has(asin)) continue;
      vistos.add(asin);
      productos.push({
        asin,
        nombre,
        marca: String(enRuta(it, F.marca) ?? '').trim(),
        imagen: ajustarImagen(String(enRuta(it, F.imagen) ?? '')),
        precio: priceFromAttr(String(primerValor(it, F.precio) ?? '')),
        link: v.url,
        variante: v.variante,
      });
      statJson.extraidos++;
    }
    return productos.length;
  }

  // Listado leído desde los datos del servidor, página por página (?currentPage=N),
  // sin bajar por la página ni necesitar la pestaña visible. Devuelve null si la
  // página no trae esos datos (búsquedas de Sephora): entonces se lee al bajar.
  async function loadJson(L, limite) {
    const J = L.json;
    let datos;
    try { datos = datosJson(await descargar(location.href), J); } catch { datos = null; }
    if (!datos?.items.length) return null;
    leerAlBajar = true;
    let n = agregarJson(datos.items, J);
    let paginas = 1;
    let aviso = '';
    const param = L.pageParam || 'currentPage';
    let actual = datos.pagina || Number(new URL(location.href).searchParams.get(param)) || 1;
    report(n, limite);
    while (seguir(n, limite, paginas, L)) {
      if (detenido()) { aviso = parar(n); break; }
      if (datos.total && actual * datos.tamano >= datos.total) break;
      await sleep(Number(L.delayMs) || 800);
      const u = new URL(location.href);
      u.searchParams.set(param, String(actual + 1));
      try { datos = datosJson(await descargar(u.href), J); } catch (e) {
        aviso = `No se pudo cargar la página ${actual + 1} (${e.message}): se extrajo lo cargado (${n}).`;
        break;
      }
      const antes = n;
      n = agregarJson(datos?.items || [], J);
      actual++;
      paginas++;
      report(n, limite, paginas);
      if (n === antes) { aviso = `La página ${actual} no trajo productos nuevos: se extrajo lo cargado (${n}).`; break; }
    }
    return { cargados: Math.min(n, limite), limite, paginas, aviso };
  }

  // Desplaza la página hasta el final para forzar la carga diferida de productos.
  async function autoScroll({ stepDelayMs = 350, maxSteps = 80 } = {}) {
    const doc = document.documentElement;
    let lastHeight = 0, stable = 0;
    for (let i = 0; i < maxSteps && stable < 3 && !detenido(); i++) {
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
    paginasPedidas = Math.floor(Number(options.pages)) || 0;
    porPaginas = paginasPedidas > 0;
    const limite = porPaginas ? Infinity : Math.floor(Number(options.limit)) || 0;
    layouts = activos.map(l => ({ id: l.id, label: l.label || l.id, encontrados: 0, extraidos: 0 }));
    // Agrega los productos de la página (o de una página descargada) que aún no
    // están; devuelve el total. En una página descargada vale `fetchItem` si el
    // layout lo trae (los tramos de "Load More" de Michael Kors no tienen la grilla).
    const leer = (root = document) => {
      activos.forEach((layout, i) => {
        const items = qsa(root, root !== document && layout.fetchItem ? layout.fetchItem : layout.item);
        for (const item of items) {
          try {
            const p = parseItem(item, layout);
            if (!p || vistos.has(p.asin)) continue;
            vistos.add(p.asin);
            productos.push(p);
            layouts[i].extraidos++;
          } catch (e) {
            console.warn(`[CF Scraper] Error en layout ${layout.id}`, e);
          }
        }
        // Leyendo al bajar, "encontrados" son los distintos vistos (los dibujados cambian).
        layouts[i].encontrados = leerAlBajar ? layouts[i].extraidos + fallos.size : items.length;
      });
      return productos.length;
    };
    const L = config.loadMore;
    let cargaMas = null;
    if (!tipo && L?.item && limite > 0 && L.mode === 'scroll') {
      leerAlBajar = true;
      marcaPagina = getPageBrand();
      // Con datos del servidor (categorías y marcas de Sephora) no hace falta bajar.
      cargaMas = (L.json && await loadJson(L, limite)) || await loadByScroll(L, limite, leer);
    } else if (!tipo && L?.item && limite > 0 && L.mode === 'fetch') {
      // Primero la página abierta (desplazándola si se ve), luego las siguientes.
      if (options.autoScroll && !document.hidden) await autoScroll(config.scroll);
      leerAlBajar = true;
      marcaPagina = getPageBrand();
      cargaMas = await loadByFetch(L, limite, leer);
    } else {
      cargaMas = !tipo && L?.item && limite > 0 ? await loadMore(L, limite) : null;
      if (!cargaMas && options.autoScroll && tipo?.autoScroll !== false) await autoScroll(config.scroll);
      marcaPagina = getPageBrand();
      leer();
    }
    // Con límite de productos, solo los primeros `limite` (en el orden de la página).
    // Con límite de páginas entran todos los productos de esas páginas.
    if (cargaMas && !porPaginas && productos.length > limite) productos.length = limite;
    if (cargaMas) Object.assign(cargaMas, { porPaginas, paginasPedidas, limite: porPaginas ? 0 : limite });
    if (detenida && cargaMas) cargaMas.detenida = true;
    console.table(productos.map(p => ({ SKU: p.asin, MARCA: p.marca, NOMBRE: p.nombre, PRECIO: p.precio, IMAGEN: p.imagen })));
    const result = { productos, layouts, marcaPagina, sinSku, excluidos: excluidos.size, cargaMas, tipoPagina: tipo ? { id: tipo.id, label: tipo.label || tipo.id } : null };
    // Con jobId, el resultado va al service worker (el popup puede estar cerrado).
    if (jobId) enviar({ type: 'scrapeDone', result });
    return result;
  } catch (e) {
    const result = { error: e.message || String(e), productos };
    if (jobId) enviar({ type: 'scrapeDone', result });
    return result;
  }
};
