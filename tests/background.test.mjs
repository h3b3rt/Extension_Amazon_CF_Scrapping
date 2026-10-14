// El service worker carga con un chrome falso (todas sus rutas de import resuelven)
// y los avisos de CAPTCHA mantienen sus textos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modulo } from './apoyo/chrome-falso.mjs';

// chrome mínimo: cualquier evento acepta addListener y cualquier método no hace nada.
const evento = () => ({ addListener() {} });
const area = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
const base = {
  runtime: { getURL: p => `chrome-extension://test/${p}`, getManifest: () => ({ version: '0.0.0' }) },
  storage: { local: area(), session: area(), sync: area() },
  notifications: { create: async () => {} },
  alarms: { create() {}, clear() {} },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setIcon: async () => {}, setTitle() {} },
};
const relleno = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : evento()) });
globalThis.chrome = new Proxy(base, { get: (t, k) => relleno(t[k] || {}) });
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

test('background.js carga', async () => {
  await import(modulo('src/background/background.js'));
});

test('captchaTxt: extracción y exportación', async () => {
  const { captchaTxt } = await import(modulo('src/comun/jobs.js'));
  assert.match(captchaTxt('Amazon'), /resuélvela antes de exportar/);
  assert.match(captchaTxt('Kate Spade'), /^⚠ Kate Spade bloqueó las descargas \(verificación del sitio\)/);
  assert.match(captchaTxt('Amazon', true), /resuélvela y vuelve a exportar/);
  assert.match(captchaTxt('Kate Spade', true), /Espera unos minutos y vuelve a exportar\.$/);
});
