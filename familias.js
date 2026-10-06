// Familias de producto: todas las variantes (color, talla…) de un mismo producto.
// Amazon: el backend descarga la familia completa de cada ASIN del Excel, así que
// dos ASIN de una misma familia crean la familia dos veces. Kate Spade: una familia
// reúne varios estilos (KN974, KO585…) que el backend crearía como productos
// aparte. En ambos casos se envía solo uno por familia.
//
// La familia está en la página de cada producto:
// - Amazon (tipo "amazon", por defecto): parentAsin y dimensionToAsinMap de /dp/.
// - Kate Spade (tipo "jsonld"): ProductGroup del JSON-LD, con hasVariant[].sku
//   ("KN974 BLK": estilo y color). productGroupID es el estilo de la página abierta,
//   así que dos páginas de una familia dan IDs distintos: quien usa la familia la
//   reconoce también por sus hermanos (ver scraper.js, verificar).
// Los listados no la traen: hay que descargar esa página.
//
// Script clásico, sin import/export: se inyecta en la pestaña antes de scraper.js
// y los módulos (service worker, popup) lo cargan con `import './familias.js'`.
// En ambos casos deja las funciones en globalThis.__cfFamilias.
(() => {
  // Valores por defecto (Amazon); config.familias del sitio (remota) puede cambiarlos.
  const DEFAULTS = {
    parent: '"parentAsin"\\s*:\\s*"([A-Z0-9]{10})"',
    hermanos: '"dimensionToAsinMap"\\s*:\\s*(\\{[^{}]*\\})',
    producto: 'id="productTitle"',
    captcha: '/errors/validateCaptcha|api-services-support@amazon\\.com',
    delayMs: 1500,
    delayMaxMs: 3000,
  };
  const ASIN_RE = /^[A-Z0-9]{10}$/;
  const regex = (p, flags = '') => { try { return p ? new RegExp(p, flags) : null; } catch { return null; } };

  const opciones = F => ({ ...DEFAULTS, ...(F && typeof F === 'object' ? F : {}) });

  // Pausa entre descargas (al azar entre delayMs y delayMaxMs) para no provocar el CAPTCHA.
  function pausa(F) {
    const o = opciones(F);
    const min = Number(o.delayMs) || DEFAULTS.delayMs;
    const max = Math.max(min, Number(o.delayMaxMs) || min);
    return min + Math.random() * (max - min);
  }

  // "KN974 BLK" o "kn974-001" → "KN974": el estilo, como lo deja el backend.
  const estilo = v => String(v ?? '').trim().split(/[\s-]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Familia según el JSON-LD (ProductGroup) de la página de un producto.
  function leerJsonLd(html, sku, o) {
    const hermanos = new Set([sku]);
    let grupo = '';
    let producto = false;
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (let m; (m = re.exec(html));) {
      let datos;
      try { datos = JSON.parse(m[1]); } catch { continue; }
      for (const d of Array.isArray(datos) ? datos : [datos]) {
        if (d?.['@type'] === 'Product') producto = true;
        if (d?.['@type'] !== 'ProductGroup') continue;
        producto = true;
        grupo = grupo || estilo(d.productGroupID);
        for (const v of Array.isArray(d.hasVariant) ? d.hasVariant : []) {
          const s = estilo(v?.sku || v?.productID || v?.mpn);
          if (s) hermanos.add(s);
        }
      }
    }
    // Sin datos de producto (bloqueo o página de error): no se puede decidir.
    if (!producto) return { error: 'sin datos' };
    // Un estilo que no aparece en su propio grupo: el grupo no es de este producto.
    if (grupo && !hermanos.has(grupo)) hermanos.add(grupo);
    return { familia: grupo || sku, hermanos: [...hermanos] };
  }

  /**
   * Familia de un producto según el HTML de su página.
   * { familia, hermanos } si se pudo leer; { error: 'captcha' | 'sin datos' } si no.
   * Un producto sin variantes es su propia familia.
   */
  function leer(html, asin, F) {
    const o = opciones(F);
    html = String(html || '');
    if (regex(o.captcha, 'i')?.test(html)) return { error: 'captcha' };
    if (o.tipo === 'jsonld') return leerJsonLd(html, asin, o);
    const parent = html.match(regex(o.parent) || /$^/)?.[1]?.toUpperCase() || '';
    const hermanos = new Set([asin]);
    const mapa = html.match(regex(o.hermanos) || /$^/)?.[1];
    if (mapa) {
      try {
        for (const v of Object.values(JSON.parse(mapa))) if (ASIN_RE.test(String(v).toUpperCase())) hermanos.add(String(v).toUpperCase());
      } catch { /* JSON inválido: solo el propio ASIN */ }
    }
    // Sin padre ni lista de hermanos, y sin ser una página de producto: no se puede decidir.
    if (!parent && hermanos.size === 1 && !regex(o.producto)?.test(html)) return { error: 'sin datos' };
    return { familia: parent || asin, hermanos: [...hermanos] };
  }

  /**
   * Descarga la página del producto y lee su familia. Amazon: /dp/ASIN; los demás
   * sitios: el link del producto (`link`). Nunca lanza error: { familia, hermanos } o { error }.
   */
  async function descargar(asin, F, origen = 'https://www.amazon.com', link = '') {
    const o = opciones(F);
    let url;
    try {
      url = o.tipo === 'jsonld' ? new URL(link, origen) : new URL(`/dp/${asin}?th=1&psc=1`, origen);
    } catch { return { error: 'sin link' }; }
    let res;
    try {
      res = await fetch(url, { credentials: 'include' });
    } catch (e) {
      return { error: `sin conexión (${e.message || e})` };
    }
    // Amazon responde 503 a los robots, con la página del CAPTCHA (Kate Spade: 403).
    const html = await res.text().catch(() => '');
    if (!res.ok) return regex(o.captcha, 'i')?.test(html) || res.status === 403 ? { error: 'captcha' } : { error: `HTTP ${res.status}` };
    return leer(html, asin, F);
  }

  // Producto de Amazon (los de versiones anteriores no guardaban el ecommerce).
  const ecomerceDe = p => p.ecomerce || 'Amazon';
  const esAmazon = p => ecomerceDe(p) === 'Amazon';

  /**
   * Familias por ecommerce según la configuración: { [ecomerce]: { F, siempre } }.
   * `siempre` (Kate Spade): uno por familia aunque el grupo no tenga "Extraer
   * variantes"; si no (Amazon), solo en los grupos con variantes.
   */
  function porEcomerce(config) {
    const mapa = {};
    const sitios = Array.isArray(config?.sites) ? config.sites : [];
    for (const s of sitios) {
      const F = s.familias || (s.id === 'amazon' ? config.familias : null);
      if (F && typeof F === 'object') mapa[s.ecomerce || s.name] = { F, siempre: F.siempre === true };
    }
    return mapa;
  }

  // ¿Este producto se agrupa por familia? (`variaciones`: el grupo tiene "Extraer variantes").
  const agrupa = (mapa, p, variaciones) => {
    const e = mapa[ecomerceDe(p)];
    return !!e && (e.siempre || !!variaciones);
  };

  /**
   * Un producto por familia, en el orden recibido (gana el primero). Amazon: solo en
   * los grupos con variaciones (`conVariaciones`, ver productsForExport); sin ellas
   * el sistema crea solo ese ASIN. Kate Spade: siempre. Los productos sin familia
   * (sin verificar) y los de sitios sin familias pasan siempre. Sin `config` (llamadas
   * anteriores), solo Amazon.
   * @returns {{ productos: object[], omitidos: object[] }} omitidos: { asin, familia, conservado }
   */
  function unoPorFamilia(products, config = null) {
    const mapa = config ? porEcomerce(config) : { Amazon: { siempre: false } };
    const vistas = new Map();
    const productos = [];
    const omitidos = [];
    for (const p of products) {
      const f = p.familia && agrupa(mapa, p, p.conVariaciones) ? `${ecomerceDe(p)}:${p.familia}` : '';
      if (f && vistas.has(f)) { omitidos.push({ asin: p.asin, familia: p.familia, conservado: vistas.get(f) }); continue; }
      if (f) vistas.set(f, p.asin);
      productos.push(p);
    }
    return { productos, omitidos };
  }

  globalThis.__cfFamilias = { DEFAULTS, pausa, leer, descargar, unoPorFamilia, porEcomerce, agrupa, esAmazon, ecomerceDe, estilo, AVISO: 'Familia sin verificar' };
})();
