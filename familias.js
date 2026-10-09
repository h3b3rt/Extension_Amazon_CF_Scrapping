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
      await new Promise(r => setTimeout(r, pausa({})));
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

  // Sitios cuyas variantes se leen aparte de las familias (solo para la vista previa):
  // LECTORES leen la página del producto; DESCARGADORES descargan por su cuenta (varias páginas).
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

  const LECTORES = { Sephora: variantesSephora, 'Michael Kors': variantesMk, 'Kate Spade': variantesKs };
  const DESCARGADORES = { 'Marc Jacobs': variantesMj };
  const leeVariantes = p => !!(LECTORES[p?.ecomerce] || DESCARGADORES[p?.ecomerce]);

  /**
   * Descarga la página del producto (`p.link`) y lee sus variantes. Nunca lanza error:
   * { variantes, dimensiones } o { error }.
   */
  async function descargarVariantes(p) {
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

  globalThis.__cfFamilias = { DEFAULTS, pausa, leer, descargar, unoPorFamilia, porEcomerce, agrupa, esAmazon, ecomerceDe, estilo, variantesSephora, variantesMk, variantesKs, leerPaginaMj, variantesMj, leeVariantes, descargarVariantes, AVISO: 'Familia sin verificar' };
})();
