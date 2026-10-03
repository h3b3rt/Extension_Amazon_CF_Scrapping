// Familias de Amazon: todas las variantes (color, talla…) de un producto padre.
// El backend descarga la familia completa de cada ASIN del Excel, así que dos ASIN
// de una misma familia crean la familia dos veces: se envía solo uno por familia.
//
// La familia está en la página /dp/ de cada producto (parentAsin y
// dimensionToAsinMap, con todos los ASIN hermanos). Los listados (búsqueda,
// tiendas, categorías) no la traen: hay que descargar esa página.
//
// Script clásico, sin import/export: se inyecta en la pestaña antes de scraper.js
// y los módulos (service worker, popup) lo cargan con `import './familias.js'`.
// En ambos casos deja las funciones en globalThis.__cfFamilias.
(() => {
  // Valores por defecto; config.familias (remota) puede cambiarlos.
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

  /**
   * Familia de un ASIN según el HTML de su página /dp/.
   * { familia, hermanos } si se pudo leer; { error: 'captcha' | 'sin datos' } si no.
   * Un producto sin variantes es su propia familia.
   */
  function leer(html, asin, F) {
    const o = opciones(F);
    html = String(html || '');
    if (regex(o.captcha)?.test(html)) return { error: 'captcha' };
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
   * Descarga la página /dp/ del ASIN y lee su familia. Nunca lanza error:
   * { familia, hermanos } o { error }.
   */
  async function descargar(asin, F, origen = 'https://www.amazon.com') {
    let res;
    try {
      res = await fetch(new URL(`/dp/${asin}?th=1&psc=1`, origen), { credentials: 'include' });
    } catch (e) {
      return { error: `sin conexión (${e.message || e})` };
    }
    // Amazon responde 503 a los robots, con la página del CAPTCHA.
    const html = await res.text().catch(() => '');
    if (!res.ok) return regex(opciones(F).captcha)?.test(html) ? { error: 'captcha' } : { error: `HTTP ${res.status}` };
    return leer(html, asin, F);
  }

  /**
   * Un producto de Amazon por familia, en el orden recibido (gana el primero).
   * Solo en los grupos con variaciones (`conVariaciones`, ver productsForExport):
   * sin variaciones el sistema crea solo ese ASIN. Los productos sin familia (sin
   * verificar) y los de otros sitios pasan siempre.
   * @returns {{ productos: object[], omitidos: object[] }} omitidos: { asin, familia, conservado }
   */
  function unoPorFamilia(products) {
    const vistas = new Map();
    const productos = [];
    const omitidos = [];
    for (const p of products) {
      const f = esAmazon(p) && p.conVariaciones ? p.familia : '';
      if (f && vistas.has(f)) { omitidos.push({ asin: p.asin, familia: f, conservado: vistas.get(f) }); continue; }
      if (f) vistas.set(f, p.asin);
      productos.push(p);
    }
    return { productos, omitidos };
  }

  // Producto de Amazon (los de versiones anteriores no guardaban el ecommerce).
  const esAmazon = p => (p.ecomerce || 'Amazon') === 'Amazon';

  globalThis.__cfFamilias = { DEFAULTS, pausa, leer, descargar, unoPorFamilia, esAmazon, AVISO: 'Familia sin verificar' };
})();
