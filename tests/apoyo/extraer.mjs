// Ejecuta los scripts inyectados (familias.js, lector.js y scraper.js) sobre una página guardada,
// como lo hace el service worker en la pestaña: misma configuración del sitio
// (config.default.json + sites.js) y sin red (cualquier descarga falla).
// Las esperas (setTimeout) se acortan para que la prueba no tarde.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { REPO, modulo } from './chrome-falso.mjs';

const { findSite, siteConfig } = await import(modulo('src/comun/sites.js'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(REPO, 'config.default.json'), 'utf8'));
const SCRIPTS = ['src/inyectados/familias.js', 'src/inyectados/lector.js', 'src/inyectados/scraper.js'].map(f => fs.readFileSync(path.join(REPO, f), 'utf8'));

// Configuración del trabajo como la arma el popup: sin "Extraer variantes" no hay
// familias, salvo los sitios que siempre las agrupan (Kate Spade).
export function configDe(url, { variaciones = false } = {}) {
  const site = findSite(CONFIG, url);
  if (!site) throw new Error(`Sin sitio para ${url}`);
  const cfg = siteConfig(CONFIG, site);
  return variaciones || cfg.familias?.siempre ? cfg : { ...cfg, familias: null };
}

// Monta la página en jsdom (sin sus scripts) con la URL que tenía la pestaña.
export function montarPagina(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const real = setTimeout;
  w.setTimeout = (f, ms, ...a) => real(f, Math.min(ms || 0, 5), ...a);
  w.scrollTo = w.scrollBy = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async () => { throw new Error('sin red'); };
  w.chrome = { runtime: { sendMessage: async () => {} } };
  if (!w.IntersectionObserver) w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  return w;
}

// Extrae la página abierta (por defecto 1 página, sin las siguientes). Devuelve el
// resultado del scraper. Con `siguiente` (otra página guardada del mismo sitio), cada
// descarga de una página siguiente la recibe como respuesta; las URL pedidas quedan en
// `r.pedidas` (simula la paginación sin red).
export async function extraer(archivo, url, { variaciones = false, opciones = { pages: 1 }, siguiente = null } = {}) {
  const w = montarPagina(fs.readFileSync(archivo, 'utf8'), url);
  const pedidas = [];
  if (siguiente) {
    const html = fs.readFileSync(siguiente, 'utf8');
    w.fetch = async u => { pedidas.push(String(u)); return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }); };
  }
  for (const s of SCRIPTS) w.eval(s);
  const tiempo = new Promise((_, rej) => setTimeout(() => rej(new Error(`tiempo agotado: ${url}`)), 60000));
  const r = await Promise.race([w.__cfScraper(configDe(url, { variaciones }), opciones), tiempo]);
  w.close();
  if (siguiente) r.pedidas = pedidas;
  return r;
}

// Resultado reducido a lo que importa comparar (sin funciones ni objetos de jsdom).
export const foto = r => JSON.parse(JSON.stringify({
  error: r.error, tipoPagina: r.tipoPagina, marcaPagina: r.marcaPagina, sinSku: r.sinSku,
  excluidos: r.excluidos, agrupados: r.agrupados, layouts: r.layouts, familias: r.familias,
  cargaMas: r.cargaMas, productos: r.productos, pedidas: r.pedidas,
}));
