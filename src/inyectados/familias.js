// Familias de producto: todas las variantes (color, talla…) de un mismo producto.
// Amazon: el backend descarga la familia completa de cada ASIN del Excel, así que
// dos ASIN de una misma familia crean la familia dos veces. Kate Spade: una familia
// reúne varios estilos (KN974, KO585…) que el backend crearía como productos
// aparte. En ambos casos se envía solo uno por familia.
// Las variantes de los demás sitios (para la vista previa) están en
// src/comun/lectores-variantes.js, que no se inyecta.
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
// y los módulos (service worker, popup) lo cargan con `import '../inyectados/familias.js'`.
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
    // Datos de cada variante (solo para mostrarlos en la vista previa).
    variantes: '"dimensionValuesDisplayData"\\s*:\\s*(\\{[^{}]*\\})',
  };
  const ASIN_RE = /^[A-Z0-9]{10}$/;
  // Tope de variantes guardadas por familia (ocupan espacio en storage.local).
  const MAX_VARIANTES = 200;
  const regex = (p, flags = '') => { try { return p ? new RegExp(p, flags) : null; } catch { return null; } };
  const https = v => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : '');

  // Objeto JSON que sigue a `"clave":` en el HTML, con llaves anidadas (un regex no
  // basta para colorImages). La primera aparición que sea JSON válido; null si ninguna.
  function objetoJson(html, clave) {
    const re = new RegExp(`["']${clave}["']\\s*:\\s*\\{`, 'g');
    for (let m, n = 0; (m = re.exec(html)) && n < 10; n++) {
      const ini = m.index + m[0].length - 1;
      let prof = 0, enTexto = false;
      for (let i = ini; i < html.length && i < ini + 2e6; i++) {
        const c = html[i];
        if (enTexto) {
          if (c === '\\') i++;
          else if (c === '"') enTexto = false;
        } else if (c === '"') enTexto = true;
        else if (c === '{') prof++;
        else if (c === '}' && !--prof) {
          try { return JSON.parse(html.slice(ini, i + 1)); } catch { break; }
        }
      }
    }
    return null;
  }

  // Lista de textos que sigue a `"clave":` (["size_name","color_name"]); [] si no está.
  function listaJson(html, clave) {
    const m = new RegExp(`"${clave}"\\s*:\\s*(\\[[^\\[\\]]*\\])`).exec(html);
    try {
      const v = m ? JSON.parse(m[1]) : [];
      return Array.isArray(v) ? v.map(String) : [];
    } catch { return []; }
  }

  // Variantes de Amazon: ASIN → atributos (en el orden de "dimensions": talla, color…)
  // y su imagen. colorImages usa como clave los valores de las dimensiones que cambian
  // la imagen ("visualDimensions") unidos por espacio: "Core Navy" en ropa (todas las
  // tallas de un color comparten imagen), "Pink 60 Ounces" si son todas. Nombre y
  // precio no: la página solo trae los de la variante abierta.
  // Devuelve { variantes, dimensiones: [{ nombre, visual }] } (dimensiones en el orden
  // de los atributos; visual = cambia la imagen, la vista previa agrupa por ellas).
  function variantesAmazon(html, o) {
    const vacio = { variantes: [], dimensiones: [] };
    try {
      const mapa = html.match(regex(o.variantes) || /$^/)?.[1];
      if (!mapa) return vacio;
      const datos = JSON.parse(mapa);
      const claves = listaJson(html, 'dimensions');
      let visuales = listaJson(html, 'visualDimensions').filter(d => claves.includes(d));
      if (!visuales.length && claves.includes('color_name')) visuales = ['color_name'];
      const valores = objetoJson(html, 'variationValues') || {};
      const etiquetas = objetoJson(html, 'variationDisplayLabels') || {};
      const imagenes = objetoJson(html, 'colorImages') || {};
      const aAsin = objetoJson(html, 'colorToAsin') || {};
      const urlDe = k => {
        const img = Array.isArray(imagenes[k]) ? imagenes[k][0] : null;
        return https(img?.large) || https(img?.hiRes) || https(img?.thumb);
      };
      // Respaldo: imagen por ASIN (colorToAsin), como antes de conocer las dimensiones.
      const porAsin = {};
      for (const [k, v] of Object.entries(aAsin)) if (v?.asin && urlDe(k)) porAsin[String(v.asin).toUpperCase()] = urlDe(k);
      const idx = visuales.map(d => claves.indexOf(d)).sort((a, b) => a - b);
      const out = [];
      for (const [asin, attrs] of Object.entries(datos)) {
        const a = String(asin).toUpperCase();
        if (!ASIN_RE.test(a)) continue;
        const atributos = (Array.isArray(attrs) ? attrs : [attrs]).map(String);
        const v = { sku: a, atributos };
        const imagen = (idx.length && urlDe(visuales.map(d => atributos[claves.indexOf(d)]).join(' ')))
          || urlDe(idx.map(i => atributos[i]).join(' ')) || urlDe(atributos.join(' ')) || porAsin[a];
        if (imagen) v.imagen = imagen;
        out.push(v);
      }
      // Orden de la página: primero las dimensiones visuales (color), luego las demás (talla).
      const orden = [...idx, ...claves.map((_, i) => i).filter(i => !idx.includes(i))];
      const pos = (i, val) => {
        const lista = valores[claves[i]];
        const n = Array.isArray(lista) ? lista.indexOf(val) : -1;
        return n < 0 ? Infinity : n;
      };
      out.sort((x, y) => {
        for (const i of orden) {
          const d = pos(i, x.atributos[i]) - pos(i, y.atributos[i]);
          if (d) return d;
        }
        return 0;
      });
      const dimensiones = claves.length === (out[0]?.atributos.length ?? -1)
        ? claves.map(d => ({ nombre: String(etiquetas[d] || d.replace(/_name$/, '')), visual: visuales.includes(d) }))
        : [];
      return { variantes: out.slice(0, MAX_VARIANTES), dimensiones };
    } catch { return vacio; }
  }

  // Variante de Kate Spade (hasVariant del JSON-LD): trae nombre, color, imagen y precio.
  function varianteJsonLd(v) {
    const sku = String(v?.sku || v?.productID || v?.mpn || '').trim();
    if (!sku) return null;
    const img = Array.isArray(v.image) ? v.image[0] : v.image;
    const oferta = Array.isArray(v.offers) ? v.offers[0] : v.offers;
    const out = { sku, atributos: [v.color, v.size].filter(x => typeof x === 'string' && x) };
    if (typeof v.name === 'string' && v.name) out.nombre = v.name;
    const imagen = https(typeof img === 'string' ? img : img?.url);
    if (imagen) out.imagen = imagen;
    const precio = Number(oferta?.price);
    if (Number.isFinite(precio) && precio > 0) out.precio = precio;
    const link = https(oferta?.url) || https(v['@id']) || https(v.url);
    if (link) out.link = link;
    return out;
  }

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
    const variantes = [];
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
          const dv = variantes.length < MAX_VARIANTES ? varianteJsonLd(v) : null;
          if (dv) variantes.push(dv);
        }
      }
    }
    // Sin datos de producto (bloqueo o página de error): no se puede decidir.
    if (!producto) return { error: 'sin datos' };
    // Un estilo que no aparece en su propio grupo: el grupo no es de este producto.
    if (grupo && !hermanos.has(grupo)) hermanos.add(grupo);
    return { familia: grupo || sku, hermanos: [...hermanos], variantes };
  }

  /**
   * Familia de un producto según el HTML de su página.
   * { familia, hermanos, variantes } si se pudo leer; { error: 'captcha' | 'sin datos' } si no.
   * `variantes`: [{ sku, atributos, imagen?, nombre?, precio?, link? }], solo informativo.
   * `dimensiones` (Amazon): [{ nombre, visual }], en el orden de `atributos`.
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
    const { variantes, dimensiones } = hermanos.size > 1 ? variantesAmazon(html, o) : { variantes: [], dimensiones: [] };
    return { familia: parent || asin, hermanos: [...hermanos], variantes, dimensiones };
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

  globalThis.__cfFamilias = { pausa, estilo, leer, descargar, unoPorFamilia, porEcomerce, agrupa, ecomerceDe, AVISO: 'Familia sin verificar' };
})();
