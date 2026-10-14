// chrome falso + jsdom como globales, para importar las páginas de la extensión tal cual.
// montar('src/popup/popup.html', { local, tab, onMessage }) arma la página sin su
// <script type="module">; después la prueba importa el .js de la página.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const modulo = rel => pathToFileURL(path.join(REPO, rel)).href;
const ORIGEN = 'chrome-extension://test/';

export function montar(page, opts = {}) {
  const { search = '', local = {}, tab = null } = opts;
  const html = fs.readFileSync(path.join(REPO, page), 'utf8').replace(/<script[^>]*type="module"[^>]*><\/script>/, '');
  const dom = new JSDOM(html, { url: `${ORIGEN}${page}${search}`, pretendToBeVisual: true });
  const w = dom.window;
  const store = { local: structuredClone(local), sync: {}, session: {} };
  const oyentes = [];
  const area = name => ({
    async get(k) {
      const s = store[name];
      if (k == null) return structuredClone(s);
      const keys = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k);
      return structuredClone(Object.fromEntries(keys.filter(x => x in s).map(x => [x, s[x]])));
    },
    async set(o) {
      const changes = {};
      for (const [k, v] of Object.entries(o)) changes[k] = { oldValue: store[name][k], newValue: structuredClone(v) };
      Object.assign(store[name], structuredClone(o));
      for (const f of oyentes) f(changes, name);
    },
    async remove(k) { for (const x of [].concat(k)) delete store[name][x]; },
  });
  const log = { downloads: [], tabs: [], messages: [] };
  const chrome = {
    storage: { local: area('local'), sync: area('sync'), session: area('session'), onChanged: { addListener: f => oyentes.push(f) } },
    runtime: {
      getURL: p => `${ORIGEN}${p.replace(/^\//, '')}`,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8')),
      sendMessage: async m => {
        log.messages.push(m);
        if (opts.onMessage) { const r = await opts.onMessage(m, store); if (r) return r; }
        return m.type === 'enqueue' ? { ok: true, posicion: 0 } : {};
      },
      openOptionsPage() {},
    },
    tabs: { query: async () => (tab ? [tab] : []), create: async t => { log.tabs.push(t); }, update: async () => {} },
    scripting: { executeScript: async () => [{ result: null }] },
    downloads: { download: async d => { log.downloads.push(d); return 1; } },
    action: {},
  };
  // Los archivos del paquete se leen del repo; la red no existe.
  const fetch = async url => {
    const u = String(url);
    if (u.startsWith(ORIGEN)) return new Response(fs.readFileSync(path.join(REPO, u.slice(ORIGEN.length).split('?')[0])));
    throw new Error('sin red');
  };
  Object.assign(globalThis, { window: w, document: w.document, location: w.location, chrome, fetch, HTMLElement: w.HTMLElement, Event: w.Event });
  w.chrome = chrome;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  return { dom, w, store, log, $: id => w.document.getElementById(id) };
}

export const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
export async function until(cond, label, n = 200) {
  for (let i = 0; i < n; i++) { if (cond()) return; await tick(25); }
  throw new Error(`tiempo agotado: ${label}`);
}
