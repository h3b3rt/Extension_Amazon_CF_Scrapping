// Vista previa montada en jsdom con un chrome falso, sobre la lista de prueba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, modulo, until, tick } from './apoyo/chrome-falso.mjs';
import { collected, groups } from './apoyo/lista.mjs';

test('vista previa: sitios, columnas técnicas y nombre del archivo', async () => {
  const { $, w } = montar('src/preview/preview.html', { local: { collected, groups } });
  await import(modulo('src/preview/preview.js'));
  await until(() => $('rows').querySelector('.ghead'), 'render');
  await tick(300);
  const sitios = [...$('siteFilter').options].map(o => o.value).filter(Boolean);
  for (const s of ['Amazon', 'Sephora', 'Kate Spade', 'Michael Kors', 'Marc Jacobs']) assert.ok(sitios.includes(s), `filtro sin ${s}`);
  // Los iconos de sitio se resuelven desde la raíz del paquete.
  const icono = $('rows').querySelector('img[src*="assets/icons/sitios"]');
  if (icono) assert.match(icono.src, /^chrome-extension:\/\/test\/assets\/icons\/sitios\//);
  $('siteFilter').value = 'Marc Jacobs';
  $('siteFilter').dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(200);
  assert.deepEqual([...$('rows').querySelectorAll('.prod .nombre')].map(n => n.textContent), ['Bucket']);
  $('exportName').value = 'prueba';
  $('exportName').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(50);
  assert.match($('exportNamePreview').textContent, /Se guardará como: .*prueba/);
});
