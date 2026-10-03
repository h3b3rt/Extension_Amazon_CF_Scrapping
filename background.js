import { getConfig, refreshRemoteConfig } from './config.js';
import { appName, findSite, siteTitle, familiasConfig } from './sites.js';
import { getPrefs } from './prefs.js';
import { getJobs, setJobs, guardarResultado, familiasDeLaLista, verificarLista, duracionTxt } from './jobs.js';
import { exportList, exportSummary } from './export.js';
import { getCachedCategories } from './categories.js';

const SYNC_ALARM = 'config-sync';
const SYNC_MINUTES = 180;
const WATCHDOG_ALARM = 'jobs-watchdog';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
  refreshRemoteConfig();
});

chrome.runtime.onStartup.addListener(() => {
  refreshRemoteConfig();
  // Al abrir Chrome no hay pestañas de una extracción anterior: se cierra la que quedó a medias.
  conLock(async () => {
    const st = await getJobs();
    if (st.actual) await terminar(st, null, 'Chrome se cerró durante la extracción: se guardó lo leído hasta ese momento.');
  }).then(iniciarSiguiente);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SYNC_ALARM) refreshRemoteConfig();
  if (alarm.name === WATCHDOG_ALARM) vigilar();
});

// Nombre del icono según el sitio de la pestaña ("Michael Kors Product Scraper").
// Chrome solo da la URL de los sitios con permiso; en el resto queda el nombre general.
async function updateTitle(tabId, url) {
  const config = await getConfig();
  const site = url ? findSite(config, url) : null;
  await chrome.action.setTitle({ tabId, title: site ? siteTitle(site) : appName(config) });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(tab => updateTitle(tabId, tab.url)).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') updateTitle(tabId, tab.url).catch(() => {});
  // La pestaña de la extracción terminó de cargar otra página: comprobar que el scraper sigue vivo.
  if (info.status === 'complete') getJobs().then(st => { if (st.actual?.tabId === tabId && st.actual.ejecutando) setTimeout(vigilar, 2000); });
});

// Si la extensión se instala desde Chrome Web Store o por política con
// update_url, aplica la nueva versión en cuanto Chrome la descargue.
chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload());

// ---------- Cola de extracciones ----------
// Una a la vez. El estado vive en storage.local ("jobs"), así sobrevive a que Chrome
// detenga el service worker; lo leído de la extracción en curso, en storage.session.

// Las operaciones sobre la cola se hacen de a una, en orden.
let lock = Promise.resolve();
const conLock = fn => (lock = lock.then(fn, fn).catch(e => console.error('[CF Scraper]', e)));

const ejecutarScript = (tabId, func, args = []) => chrome.scripting.executeScript({ target: { tabId }, func, args });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = HANDLERS[msg?.type];
  if (!h) return false;
  Promise.resolve(h(msg, sender)).then(sendResponse, e => sendResponse({ error: e.message }));
  return true;
});

const HANDLERS = {
  // Desde el popup.
  async enqueue({ job }) {
    let posicion = 0;
    await conLock(async () => {
      const st = await getJobs();
      job.id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      job.creado = new Date().toISOString();
      st.cola.push(job);
      posicion = st.actual ? st.cola.length : 0;
      await setJobs(st);
    });
    iniciarSiguiente();
    return { posicion };
  },
  async removeJob({ id }) {
    await conLock(async () => {
      const st = await getJobs();
      st.cola = st.cola.filter(j => j.id !== id);
      await setJobs(st);
      await pintarIcono(st);
    });
    return { ok: true };
  },
  async stopJob() {
    const st = await getJobs();
    if (!st.actual) return { ok: false };
    // Exportación: deja de verificar familias y descarga con lo verificado.
    if (st.actual.tipo === 'exportar') {
      await conLock(async () => {
        const s = await getJobs();
        if (s.actual?.id === st.actual.id) { s.actual.detener = true; await setJobs(s); }
      });
      return { ok: true };
    }
    try {
      // También responde "Detener" si la extracción espera la confirmación de familias.
      await ejecutarScript(st.actual.tabId, () => { globalThis.__cfDetener = true; globalThis.__cfResponder?.('detener'); });
      await quitarConfirmacion(st.actual.id);
    } catch {
      // La pestaña ya no existe: se guarda lo leído.
      await conLock(async () => terminar(await getJobs(), null, 'Detenida: se guardó lo leído hasta ese momento.', st.actual.id));
      iniciarSiguiente();
    }
    return { ok: true };
  },
  async seen() {
    const st = await getJobs();
    if (st.ultimo && !st.ultimo.visto) { st.ultimo.visto = true; await setJobs(st); }
    await pintarIcono(st);
    return { ok: true };
  },
  async focusJob({ tabId }) {
    await enfocar(tabId);
    return { ok: true };
  },
  // Respuesta a "¿seguir hasta tener N familias?": "seguir" o "detener".
  async answerJob({ respuesta }) {
    return { ok: await responder(respuesta) };
  },

  // Desde el scraper (en la pestaña).
  async scrapeProgress(msg) {
    await conLock(async () => {
      const st = await getJobs();
      if (!st.actual || st.actual.id !== msg.jobId) return;
      const antes = st.actual.progreso || {};
      const progreso = {
        pagina: msg.pagina, paginas: msg.paginas, cargados: msg.cargados, limite: msg.limite, pausada: !!msg.pausada,
        analizados: msg.analizados, familias: msg.familias, verificando: !!msg.verificando,
      };
      st.actual.progreso = progreso;
      st.actual.ultimoAviso = Date.now();
      marcarEspera(st.actual);
      // No escribir en cada paso: solo si cambia algo visible o cada 1,5 s.
      if (antes.pausada !== progreso.pausada || antes.pagina !== progreso.pagina || Date.now() - (antes.escrito || 0) > 1500) {
        progreso.escrito = Date.now();
        await setJobs(st);
        await pintarIcono(st);
      }
    });
  },
  async scrapePartial(msg) {
    const { parcial } = await chrome.storage.session.get('parcial');
    if (!parcial || parcial.id !== msg.jobId) return;
    parcial.productos.push(...(msg.productos || []));
    await chrome.storage.session.set({ parcial });
  },
  async scrapeDone(msg) {
    await conLock(async () => terminar(await getJobs(), msg.result, '', msg.jobId));
    iniciarSiguiente();
  },
  // Con límite de productos se analizaron tantos como el límite, pero hay menos
  // familias: la extracción espera (sin límite de tiempo) a que el usuario elija.
  async scrapeConfirm(msg) {
    let job = null;
    await conLock(async () => {
      const st = await getJobs();
      if (!st.actual || st.actual.id !== msg.jobId) return;
      st.actual.confirmacion = { analizados: msg.analizados, familias: msg.familias, limite: msg.limite };
      marcarEspera(st.actual);
      await setJobs(st);
      await pintarIcono(st);
      job = st.actual;
    });
    if (!job) return;
    try {
      await chrome.notifications.create(`confirm-${job.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Hay familias repetidas',
        message: `${job.nombreGrupo}: se analizaron ${msg.analizados} productos y hay ${msg.familias} familias. ¿Seguir hasta tener ${msg.limite} familias?`,
        buttons: [{ title: 'Seguir' }, { title: 'Detener y guardar' }],
        requireInteraction: true,
      });
    } catch (e) {
      console.warn('[CF Scraper] Sin notificación', e);
    }
  },
};

// ---------- Duración ----------
// Solo cuenta el trabajo de la extracción: no la espera en la cola, ni la pregunta
// "¿seguir?" sin responder, ni la pausa con la pestaña de Sephora oculta.

// Abre o cierra el tramo de espera según el estado de `a` (st.actual). Sin guardar.
function marcarEspera(a) {
  const esperando = !!(a.confirmacion || a.progreso?.pausada);
  if (esperando && !a.esperaDesde) a.esperaDesde = Date.now();
  if (!esperando && a.esperaDesde) {
    a.esperaMs = (a.esperaMs || 0) + Date.now() - a.esperaDesde;
    delete a.esperaDesde;
  }
}

function duracionMs(a) {
  const espera = (a.esperaMs || 0) + (a.esperaDesde ? Date.now() - a.esperaDesde : 0);
  return Math.max(0, Date.now() - Date.parse(a.inicio) - espera);
}

// Envía la respuesta a la pestaña de la extracción que espera confirmación.
async function responder(respuesta) {
  const st = await getJobs();
  if (!st.actual?.confirmacion) return false;
  try {
    await ejecutarScript(st.actual.tabId, r => { globalThis.__cfResponder?.(r); }, [respuesta === 'seguir' ? 'seguir' : 'detener']);
  } catch { return false; /* pestaña cerrada: onRemoved guarda lo leído */ }
  await quitarConfirmacion(st.actual.id);
  return true;
}

async function quitarConfirmacion(jobId) {
  await conLock(async () => {
    const st = await getJobs();
    if (st.actual?.id !== jobId || !st.actual.confirmacion) return;
    delete st.actual.confirmacion;
    marcarEspera(st.actual);
    await setJobs(st);
    await pintarIcono(st);
  });
  chrome.notifications?.clear(`confirm-${jobId}`);
}

chrome.notifications?.onButtonClicked?.addListener(async (id, boton) => {
  if (!id.startsWith('confirm-')) return;
  const st = await getJobs();
  if (st.actual?.id === id.slice('confirm-'.length)) await responder(boton === 0 ? 'seguir' : 'detener');
  chrome.notifications.clear(id);
});

// Empieza la siguiente de la cola si no hay ninguna en curso.
function iniciarSiguiente() {
  return conLock(async () => {
    const st = await getJobs();
    if (st.actual || !st.cola.length) { await pintarIcono(st); return; }
    const job = st.cola.shift();
    st.actual = { ...job, inicio: new Date().toISOString(), progreso: {}, ejecutando: false, ultimoAviso: Date.now() };
    await setJobs(st);
    await chrome.storage.session.set({ parcial: { id: job.id, productos: [] } });
    await pintarIcono(st);
    chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
    ejecutar(st.actual); // sin esperar: el resultado llega con scrapeDone
  });
}

async function ejecutar(job) {
  if (job.tipo === 'exportar') return ejecutarExportacion(job);
  try {
    const tabId = await asegurarPestana(job);
    const prefs = await getPrefs();
    // familias.js antes que scraper.js: verificación de familias de Amazon.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['familias.js', 'scraper.js'] });
    const opts = {
      autoScroll: prefs.autoScroll,
      limit: job.limite && job.limite.modo !== 'paginas' ? job.limite.valor : 0,
      pages: job.limite?.modo === 'paginas' ? job.limite.valor : 0,
      jobId: job.id,
      familiasLista: await familiasDeLaLista(job),
    };
    await conLock(async () => {
      const st = await getJobs();
      if (st.actual?.id === job.id) { st.actual.tabId = tabId; st.actual.ejecutando = true; await setJobs(st); }
    });
    // Arranca el scraper y no espera: avisa con mensajes (scrapeProgress/scrapePartial/scrapeDone).
    // __cfCorriendo queda en la página: si desaparece, la página se recargó o cambió (ver vigilar).
    await ejecutarScript(tabId, (c, o) => {
      globalThis.__cfCorriendo = o.jobId;
      globalThis.__cfScraper(c, o);
      return true;
    }, [job.cfg, opts]);
  } catch (e) {
    await conLock(async () => terminar(await getJobs(), null, `No se pudo extraer: ${e.message}`, job.id));
    iniciarSiguiente();
  }
}

// Pestaña de la extracción: la original si sigue en esa página; si se cerró o
// cambió de página, se abre la página en una pestaña nueva en segundo plano.
async function asegurarPestana(job) {
  try {
    const tab = await chrome.tabs.get(job.tabId);
    if (tab.url === job.tabUrl) return tab.id;
  } catch { /* la pestaña ya no existe */ }
  const tab = await chrome.tabs.create({ url: job.tabUrl, active: false });
  await new Promise((resolve, reject) => {
    const fin = setTimeout(() => { chrome.tabs.onUpdated.removeListener(oir); reject(new Error('la página no terminó de cargar')); }, 60000);
    function oir(id, info) {
      if (id === tab.id && info.status === 'complete') { clearTimeout(fin); chrome.tabs.onUpdated.removeListener(oir); resolve(); }
    }
    chrome.tabs.onUpdated.addListener(oir);
  });
  return tab.id;
}

/**
 * Cierra la extracción en curso (si es `jobId`): guarda el resultado, o lo leído
 * hasta ese momento si no hay resultado, avisa y deja la cola lista para la siguiente.
 * Se llama dentro de conLock.
 */
async function terminar(st, result, motivo = '', jobId = st.actual?.id) {
  const job = st.actual;
  if (!job || job.id !== jobId) return;
  if (job.tipo === 'exportar') {
    return terminarExportacion(st, { ok: false, mensaje: `${motivo || 'La exportación se interrumpió.'}\nLas familias verificadas quedaron guardadas: vuelve a pulsar "Descargar Excel".` });
  }
  chrome.notifications?.clear(`confirm-${job.id}`);
  const { parcial } = await chrome.storage.session.get('parcial');
  const leidos = parcial?.id === job.id ? parcial.productos : [];
  let r = result;
  if (!r || (r.error && !r.productos?.length)) {
    // Sin resultado (pestaña cerrada, página recargada, error): lo leído hasta ese momento.
    r = leidos.length ? { productos: leidos, layouts: [], sinSku: 0, excluidos: 0, cargaMas: null } : r;
    motivo = motivo || r?.error || '';
  } else if (r.error) {
    motivo = motivo || `Error: ${r.error}. Se guardó lo leído.`;
  }
  let salida;
  job.duracionMs = duracionMs(job);
  try {
    salida = await guardarResultado(job, r, motivo);
  } catch (e) {
    salida = { ok: false, productos: 0, mensaje: `No se pudo guardar la extracción: ${e.message}` };
  }
  st.actual = null;
  st.ultimo = { id: job.id, ok: salida.ok, mensaje: salida.mensaje, nombre: job.nombreGrupo, sitio: job.site.name, fecha: new Date().toISOString(), visto: false };
  await setJobs(st);
  await chrome.storage.session.remove('parcial');
  if (!st.cola.length) chrome.alarms.clear(WATCHDOG_ALARM);
  await pintarIcono(st);
  avisar(job, salida, r?.cargaMas, job.duracionMs);
}

// ---------- Exportación con verificación de familias ----------
// "Descargar Excel" con productos de Amazon sin familia (de versiones anteriores o
// sin verificar): antes de descargar se lee su familia (página /dp/, con pausas) y
// el Excel lleva un producto por familia. Puede tardar minutos: corre aquí, en la
// cola, para que no se pierda al cerrar el popup.

let exportando = null;

async function ejecutarExportacion(job) {
  if (exportando === job.id) return;
  exportando = job.id;
  let salida;
  try {
    const config = await getConfig();
    const F = familiasConfig(config);
    const estaActual = async () => (await getJobs()).actual?.id === job.id;
    const v = F
      ? await verificarLista(F, async (i, total) => {
        await conLock(async () => {
          const st = await getJobs();
          if (st.actual?.id !== job.id) return;
          st.actual.progreso = { verificando: i, total };
          await setJobs(st);
          await pintarIcono(st);
        });
      }, async () => !(await estaActual()) || !!(await getJobs()).actual?.detener)
      : null;
    if (!(await estaActual())) return;
    const { collected = {}, groups = {} } = await chrome.storage.local.get(['collected', 'groups']);
    const categorias = (await getCachedCategories()).items || [];
    const r = await exportList(collected, groups, config, categorias, job.fileName);
    const lineas = [];
    if (v?.total) lineas.push(`Familias verificadas antes de exportar: ${v.verificados} de ${v.total}`);
    if (v?.detenida) lineas.push('⚠ Detenida: el resto se exportó sin verificar.');
    if (v?.captcha) lineas.push('⚠ Amazon pidió una verificación (CAPTCHA): se dejaron de verificar familias. Ábrela en amazon.com, resuélvela y vuelve a exportar.');
    salida = { ok: true, mensaje: [`✓ ${exportSummary(r)}`, ...lineas].join('\n') };
  } catch (e) {
    salida = { ok: false, mensaje: `No se pudo generar el Excel: ${e.message}` };
  } finally {
    exportando = null;
  }
  await conLock(async () => {
    const st = await getJobs();
    if (st.actual?.id === job.id) await terminarExportacion(st, salida);
  });
  iniciarSiguiente();
}

// Se llama dentro de conLock.
async function terminarExportacion(st, salida) {
  const job = st.actual;
  const tiempo = duracionTxt(duracionMs(job));
  salida = { ...salida, mensaje: `${salida.mensaje}\nDuración: ${tiempo}` };
  st.actual = null;
  st.ultimo = { id: job.id, ok: salida.ok, mensaje: salida.mensaje, nombre: job.nombreGrupo, sitio: 'Excel', fecha: new Date().toISOString(), visto: false };
  await setJobs(st);
  if (!st.cola.length) chrome.alarms.clear(WATCHDOG_ALARM);
  await pintarIcono(st);
  try {
    await chrome.notifications.create(`job-${job.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: salida.ok ? 'Excel descargado' : 'No se pudo exportar',
      message: [...salida.mensaje.replace(/^✓ /, '').split('\n').slice(0, 2), tiempo].join(' · '),
    });
  } catch { /* sin notificación */ }
}

// Notificación de Chrome al terminar; al pulsarla se abre la pestaña de la extracción.
async function avisar(job, salida, carga, ms) {
  const paginas = carga?.paginas ? ` · ${carga.paginas} página${carga.paginas === 1 ? '' : 's'}` : '';
  const tiempo = ms != null ? ` · ${duracionTxt(ms)}` : '';
  const id = `job-${job.id}`;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: salida.ok ? 'Extracción completada' : 'Extracción sin productos',
      message: salida.ok ? `${job.nombreGrupo} · ${job.site.name}${paginas} · ${salida.productos} productos${tiempo}` : `${job.nombreGrupo} · ${job.site.name}: ${salida.mensaje.split('\n')[0]}${tiempo}`,
    });
    const { avisos = {} } = await chrome.storage.session.get('avisos');
    await chrome.storage.session.set({ avisos: { ...avisos, [id]: job.tabId } });
  } catch (e) {
    console.warn('[CF Scraper] Sin notificación', e);
  }
}

chrome.notifications?.onClicked.addListener(async id => {
  const { avisos = {} } = await chrome.storage.session.get('avisos');
  if (avisos[id]) await enfocar(avisos[id]);
  chrome.notifications.clear(id);
});

async function enfocar(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch { /* la pestaña ya no existe */ }
}

// Icono: avance de la extracción ("2/5", "84", "⏸" si está en pausa), ✓ al terminar.
async function pintarIcono(st) {
  let text = '';
  let color = '#ff9900';
  if (st.actual) {
    const p = st.actual.progreso || {};
    if (p.pausada || st.actual.confirmacion) { text = '⏸'; color = '#b91c1c'; }
    else if (p.total) text = String(p.verificando || 0);
    else if (p.paginas) text = `${p.pagina || 1}/${p.paginas}`;
    else text = p.cargados != null ? String(p.cargados) : '…';
  } else if (st.ultimo && !st.ultimo.visto) {
    text = st.ultimo.ok ? '✓' : '!';
    color = st.ultimo.ok ? '#15803d' : '#b91c1c';
  }
  try {
    await chrome.action.setBadgeText({ text: text.slice(0, 4) });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch { /* sin icono */ }
}

// Pestaña cerrada durante la extracción: se guarda lo leído y sigue la cola.
chrome.tabs.onRemoved.addListener(tabId => {
  getJobs().then(st => {
    if (st.actual?.tabId !== tabId || !st.actual.ejecutando) return;
    conLock(async () => terminar(await getJobs(), null, 'Se cerró la pestaña: se guardó lo leído hasta ese momento.', st.actual.id)).then(iniciarSiguiente);
  });
});

// Cada minuto (y cuando la pestaña recarga): si el scraper ya no corre en la
// pestaña (la página se recargó o se cambió), se guarda lo leído.
async function vigilar() {
  const st = await getJobs();
  if (!st.actual) { chrome.alarms.clear(WATCHDOG_ALARM); return; }
  // Exportación cortada porque Chrome detuvo el service worker: sigue donde quedó
  // (las familias ya verificadas están guardadas en la lista).
  if (st.actual.tipo === 'exportar') { if (exportando !== st.actual.id) ejecutarExportacion(st.actual); return; }
  if (!st.actual.ejecutando) return;
  let vivo = false;
  try {
    const [r] = await ejecutarScript(st.actual.tabId, () => globalThis.__cfCorriendo || null);
    vivo = r?.result === st.actual.id;
  } catch { vivo = false; }
  if (!vivo) {
    await conLock(async () => terminar(await getJobs(), null, 'La pestaña cambió de página o se recargó: se guardó lo leído hasta ese momento.', st.actual.id));
    iniciarSiguiente();
  }
}
