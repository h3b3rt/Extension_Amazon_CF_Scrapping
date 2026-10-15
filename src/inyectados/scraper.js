// Se inyecta en la pestaña del sitio (Amazon, Michael Kors…), después de familias.js
// y lector.js (que lee cada producto). Registra una función
// global que recibe la configuración del sitio (layouts y selectores, posiblemente
// remota) y devuelve los productos encontrados. Toda la lógica específica de cada
// layout vive en la configuración, así que un cambio de HTML se corrige sin
// publicar una nueva versión de la extensión.
//
// El SKU se guarda en el campo `asin` (nombre heredado de cuando solo había Amazon).
globalThis.__cfScraper = async function (config, options = {}) {
  // lector.js se inyecta antes: sin él no se puede leer ningún producto.
  if (typeof globalThis.__cfLector !== 'function') {
    const result = { error: 'No se cargó lector.js: recarga la extensión y vuelve a intentarlo.', productos: [] };
    try { if (options.jobId) chrome.runtime.sendMessage({ type: 'scrapeDone', result, jobId: options.jobId }).catch(() => {}); } catch { /* sin receptor */ }
    return result;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Lectura de cada producto (lector.js): selectores, SKU, link, precio, imagen y marca.
  const LECTOR = globalThis.__cfLector(config);
  const { list, text, qs, qsa, firstEl, valid, armarLink, ajustarImagen, priceFromAttr, parseItem, getPageBrand, getPageType, fallos, excluidos } = LECTOR;
  // Marca de la página, modo "leer al bajar" y productos sin SKU (compartidos con el lector).
  const lectura = LECTOR.estado;
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
  // Productos leídos en total (con familias, también los que aún no se verificaron).
  let leidos = 0;
  // Con modelo base: IDs con color vistos y los que dieron un producto (el resto se agrupó).
  const colores = new Set();
  const primeros = new Set();
  let layouts = [];
  const jobId = options.jobId || null;
  const enviar = msg => { try { chrome.runtime.sendMessage({ ...msg, jobId }).catch(() => {}); } catch { /* sin receptor */ } };

  // "Detener y guardar lo leído": el service worker pone esta marca en la pestaña.
  globalThis.__cfDetener = false;
  globalThis.__cfResponder = null;
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

  // ---- Familias (config.familias de Amazon y Kate Spade; ver familias.js) ----
  // Lo leído pasa primero por `pendientes`: cada producto se verifica (familia en su
  // página) y solo el primero de cada familia entra en `productos`. Con límite de
  // productos, el límite cuenta familias; `analizados` son los productos verificados.
  const FAM = config.familias && globalThis.__cfFamilias ? globalThis.__cfFamilias : null;
  const pendientes = [];
  const lista = options.familiasLista || {};
  // ASIN → familia: los de la lista (de extracciones anteriores) y los hermanos ya conocidos.
  // `lista.hermanos` (Kate Spade): los otros estilos de esas familias.
  const familiaDe = new Map([...Object.entries(lista.hermanos || {}), ...Object.entries(lista.porAsin || {})]);
  const enListaPropios = new Set(Object.keys(lista.porAsin || {}));
  const fam = { analizados: 0, enPagina: 0, enLista: {}, captcha: false, descargas: 0 };
  // Familia → ASIN que la representa en esta extracción.
  const tomadas = new Map();
  // Página de producto: la familia se lee de la misma página, sin descargar. Con
  // `familias.descargarPropia` (Kate Spade) se lee de una copia nueva de la página:
  // tras navegar dentro del sitio, el JSON-LD de la pestaña puede ser del producto anterior.
  let docPropio = false;

  async function familiaPorDescarga(p) {
    if (docPropio && !config.familias.descargarPropia) return FAM.leer(document.documentElement.outerHTML, p.asin, config.familias);
    if (fam.descargas++) await sleep(FAM.pausa(config.familias));
    return FAM.descargar(p.asin, config.familias, location.origin, docPropio ? location.href : p.link);
  }

  // Familia de un producto ya conocida: la suya o la de un hermano (Kate Spade: cada
  // página nombra la familia con su propio estilo, así que se usa la primera conocida).
  const familiaConocida = (asin, hermanos = []) => [asin, ...hermanos].map(h => familiaDe.get(h)).find(Boolean) || '';

  // Verifica los productos pendientes en orden hasta tener `limite` familias. Sin
  // descargas tras un CAPTCHA o al detener: entonces solo se usan las familias ya
  // conocidas y el resto queda "sin verificar" (se vuelve a intentar al exportar).
  async function verificar(limite = Infinity, pagina = paginaActual) {
    if (!FAM) return;
    while (pendientes.length && productos.length < limite) {
      const p = pendientes.shift();
      fam.analizados++;
      let f = familiaConocida(p.asin);
      if (!f && !fam.captcha && !detenido()) {
        report(leidos, limite, pagina, { verificando: true });
        const r = await familiaPorDescarga(p);
        if (r.error === 'captcha') fam.captcha = true;
        if (r.familia) {
          f = familiaConocida(p.asin, r.hermanos) || r.familia;
          for (const h of r.hermanos) if (!familiaDe.has(h)) familiaDe.set(h, f);
          // Kate Spade: los estilos de la familia, para reconocerla en extracciones siguientes.
          if (config.familias.guardarHermanos) p.hermanos = r.hermanos;
          // Tamaño de la familia (solo informativo: lo muestra la vista previa).
          p.familiaTam = r.hermanos.length;
          // Datos de cada variante (también informativos: desplegable de la vista previa).
          if (r.variantes?.length) p.variantes = r.variantes;
          if (r.dimensiones?.length) p.variantesDims = r.dimensiones;
        }
      }
      if (!f) {
        p.familiaAviso = FAM.AVISO;
        productos.push(p);
        continue;
      }
      familiaDe.set(p.asin, f);
      // Otro producto de una familia ya tomada en esta extracción: gana el primero de la
      // página, que cuenta cuántos de su familia se omitieron (lo muestra la vista previa).
      if (tomadas.has(f)) {
        fam.enPagina++;
        const rep = productos.find(x => x.asin === tomadas.get(f));
        if (rep) rep.familiaOmitidos = (rep.familiaOmitidos || 0) + 1;
        continue;
      }
      // Familia que ya está en la lista por otro ASIN: se queda la de la lista.
      const grupo = lista.grupos?.[f];
      if (grupo && !enListaPropios.has(p.asin)) { fam.enLista[grupo] = (fam.enLista[grupo] || 0) + 1; continue; }
      tomadas.set(f, p.asin);
      p.familia = f;
      productos.push(p);
    }
    report(leidos, limite, pagina);
  }

  // Pausa la extracción y pregunta si seguir hasta tener `limite` familias. El service
  // worker responde con __cfResponder ("seguir" o "detener"; también al pulsar Detener).
  function confirmar(limite) {
    return new Promise(resolve => {
      globalThis.__cfResponder = r => { globalThis.__cfResponder = null; resolve(r); };
      if (detenido()) { globalThis.__cfResponder('detener'); return; }
      enviarParcial(true);
      enviar({ type: 'scrapeConfirm', analizados: fam.analizados, familias: productos.length, limite });
    });
  }

  // Avance de la carga, para el popup y el icono.
  let paginaActual = 1;
  function report(cargados, limite, pagina = 1, extra = {}) {
    paginaActual = pagina;
    // Con familias, lo que cuenta son las familias tomadas, no los productos leídos.
    if (FAM) {
      extra = { analizados: fam.analizados, familias: productos.length, ...extra };
      cargados = productos.length;
    }
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
  // Kate Spade (L.pageFetch = { param, startParam }): scroll infinito que cambia la URL
  // (?page=3) y deja en la pestaña las páginas 1 a 3. La siguiente se arma desde la
  // URL de la pestaña (nunca desde rel=next de la pestaña: tras navegar dentro del
  // sitio puede ser de la página anterior): ?page=4&startFrom=4 trae solo esa página;
  // si no trae nada nuevo, ?page=4 trae la lista completa hasta ella (se deduplica).
  async function loadByFetch(L, limite, leer) {
    let n = leer(document);
    let doc = document;
    let paginas = 1;
    let aviso = '';
    let ultimaUrl = '';
    let nuevos = n;
    const PF = L.pageFetch?.param ? L.pageFetch : null;
    let numero = 1;
    try { numero = Math.max(1, parseInt(new URL(location.href).searchParams.get(PF?.param), 10) || 1); } catch { /* URL sin número */ }
    let completa = !PF?.startParam;
    const urlPagina = (num, sola) => {
      const u = new URL(location.href);
      u.hash = '';
      u.searchParams.set(PF.param, String(num));
      if (sola) u.searchParams.set(PF.startParam, String(num));
      else u.searchParams.delete(PF.startParam);
      return u.href;
    };
    // Con familias (Amazon), el límite de productos cuenta familias, no productos leídos.
    const cuenta = () => (FAM ? productos.length : n);
    const familiasTxt = () => `${cuenta()} familias de ${limite}`;
    let confirmado = false;
    report(n, limite);
    await verificar(limite);
    for (;;) {
      if (!seguir(cuenta(), limite, paginas, L)) {
        if (FAM && !porPaginas && cuenta() < limite && paginas >= tope(L)) aviso = `Se llegó al máximo de ${tope(L)} páginas: ${familiasTxt()}.`;
        break;
      }
      if (detenido()) { aviso = parar(cuenta()); break; }
      // Con pageFetch: en las páginas descargadas, sin rel=next ya no hay más.
      let href = !PF ? siguienteDe(doc, L) : paginas > 1 && !firstEl(doc, L.next) ? '' : urlPagina(numero + 1, !completa);
      // El botón de la página abierta puede no existir aún (se crea al bajar): se busca en la copia del servidor.
      if (!href && !PF && paginas === 1 && L.nextAttr) {
        try { href = siguienteDe(await descargar(location.href), L); } catch { /* sin copia: seguir sin botón */ }
      }
      // Sin enlace pero con un tramo completo: el siguiente tramo por su parámetro (start += sz).
      if (!href && ultimaUrl && L.startParam) {
        const u = new URL(ultimaUrl, location.href);
        const sz = Number(u.searchParams.get(L.sizeParam || 'sz')) || 0;
        if (sz && nuevos >= sz) { u.searchParams.set(L.startParam, String((Number(u.searchParams.get(L.startParam)) || 0) + sz)); href = u.href; }
      }
      if (!href) {
        if (FAM && !porPaginas && cuenta() < limite && fam.analizados >= limite) aviso = `No hay más páginas: ${familiasTxt()}.`;
        break;
      }
      // Ya se analizaron tantos productos como el límite, pero faltan familias y hay
      // página siguiente: se pregunta una sola vez.
      if (FAM && !porPaginas && !confirmado && fam.analizados >= limite) {
        const r = await confirmar(limite);
        if (r !== 'seguir') {
          aviso = detenido() ? parar(cuenta()) : `Se detuvo tras analizar ${fam.analizados} productos: ${familiasTxt()}.`;
          break;
        }
        confirmado = true;
      }
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
      // La página sola no trajo nada nuevo: la lista completa hasta esa página.
      if (PF && n === antes && !completa) {
        completa = true;
        await sleep(Number(L.delayMs) || 1500);
        try {
          doc = await descargar(urlPagina(numero + 1, false));
          n = leer(doc);
        } catch (e) {
          aviso = `No se pudo cargar la página ${paginas + 1} (${e.message}): se extrajo lo cargado (${n}).`;
          break;
        }
        // Nada nuevo y sin rel=next: la lista terminaba en la página abierta (sin aviso).
        if (n === antes && !firstEl(doc, L.next)) {
          if (FAM && !porPaginas && cuenta() < limite && fam.analizados >= limite) aviso = `No hay más páginas: ${familiasTxt()}.`;
          break;
        }
      }
      numero++;
      nuevos = n - antes;
      paginas++;
      report(n, limite, paginas);
      // Sin productos nuevos: fin de la lista o una verificación ("captcha") del sitio.
      if (n === antes) {
        aviso = `La página ${paginas} no trajo productos nuevos: se extrajo lo cargado (${cuenta()}).`;
        break;
      }
      await verificar(limite, paginas);
    }
    return { cargados: Math.min(cuenta(), limite), limite, paginas, aviso };
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
      if (!v) { fallos.add(id || JSON.stringify(it).slice(0, 80)); lectura.sinSku = fallos.size; continue; }
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
    lectura.leerAlBajar = true;
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

  try {
    // Solo la tienda de EE. UU. del sitio (Marc Jacobs: /us-en/); otras regiones tienen otros precios.
    if (config.onlyPath) {
      let propia = true;
      try { propia = new RegExp(config.onlyPath.pattern, 'i').test(location.pathname); } catch { /* patrón remoto inválido */ }
      if (!propia) throw new Error(config.onlyPath.message || 'Esta región del sitio no se extrae.');
    }
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
            const leido = parseItem(item, layout);
            if (!leido) continue;
            const { crudo: color, ...p } = leido;
            // Otro color de un modelo ya leído: el backend lo guardaría como el mismo producto.
            if (color) colores.add(color);
            if (vistos.has(p.asin)) continue;
            vistos.add(p.asin);
            if (color) primeros.add(color);
            // Con familias se verifica después (verificar), en el mismo orden.
            (FAM ? pendientes : productos).push(p);
            leidos++;
            layouts[i].extraidos++;
          } catch (e) {
            console.warn(`[CF Scraper] Error en layout ${layout.id}`, e);
          }
        }
        // Leyendo al bajar, "encontrados" son los distintos vistos (los dibujados cambian).
        layouts[i].encontrados = lectura.leerAlBajar ? layouts[i].extraidos + fallos.size : items.length;
      });
      return leidos;
    };
    docPropio = !!tipo;
    const L = config.loadMore;
    let cargaMas = null;
    if (!tipo && L?.item && limite > 0 && L.mode === 'scroll') {
      lectura.leerAlBajar = true;
      lectura.marcaPagina = getPageBrand();
      // Con datos del servidor (categorías y marcas de Sephora) no hace falta bajar.
      cargaMas = (L.json && await loadJson(L, limite)) || await loadByScroll(L, limite, leer);
    } else if (!tipo && L?.item && limite > 0 && L.mode === 'fetch') {
      // Primero la página abierta (desplazándola si se ve), luego las siguientes.
      if (options.autoScroll && !document.hidden) await autoScroll(config.scroll);
      lectura.leerAlBajar = true;
      lectura.marcaPagina = getPageBrand();
      cargaMas = await loadByFetch(L, limite, leer);
    } else {
      cargaMas = !tipo && L?.item && limite > 0 ? await loadMore(L, limite) : null;
      if (!cargaMas && options.autoScroll && tipo?.autoScroll !== false) await autoScroll(config.scroll);
      lectura.marcaPagina = getPageBrand();
      leer();
    }
    // Listados sin límite (tiendas, portadas de categoría) y la página de producto.
    // Tras detener o en los otros modos de carga, lo que quede: solo hasta el límite.
    await verificar(!porPaginas && limite > 0 ? limite : Infinity);
    // Con límite de productos, solo los primeros `limite` (en el orden de la página).
    // Con límite de páginas entran todos los productos de esas páginas.
    if (cargaMas && !porPaginas && productos.length > limite) productos.length = limite;
    if (cargaMas) Object.assign(cargaMas, { porPaginas, paginasPedidas, limite: porPaginas ? 0 : limite });
    if (detenida && cargaMas) cargaMas.detenida = true;
    console.table(productos.map(p => ({ SKU: p.asin, MARCA: p.marca, NOMBRE: p.nombre, PRECIO: p.precio, IMAGEN: p.imagen })));
    const agrupados = [...colores].filter(c => !primeros.has(c)).length;
    const familias = FAM ? {
      analizados: fam.analizados, familias: productos.length, enPagina: fam.enPagina, enLista: fam.enLista,
      sinVerificar: productos.filter(p => p.familiaAviso).length, captcha: fam.captcha,
    } : null;
    const result = { productos, layouts, marcaPagina: lectura.marcaPagina, sinSku: lectura.sinSku, excluidos: excluidos.size, agrupados, cargaMas, familias, tipoPagina: tipo ? { id: tipo.id, label: tipo.label || tipo.id } : null };
    // Con jobId, el resultado va al service worker (el popup puede estar cerrado).
    if (jobId) enviar({ type: 'scrapeDone', result });
    return result;
  } catch (e) {
    const result = { error: e.message || String(e), productos };
    if (jobId) enviar({ type: 'scrapeDone', result });
    return result;
  }
};
