// Vista previa en jsdom: acciones que cambian la lista y el desplegable de variantes.
// Las respuestas del service worker usan las mismas funciones de groups.js
// (quitarDeLista, restaurarEnLista, cambiarGuiaTalla) sobre el storage falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, modulo, until, tick } from './apoyo/chrome-falso.mjs';
import { collected, groups } from './apoyo/lista.mjs';

const { quitarDeLista, restaurarEnLista, cambiarGuiaTalla } = await import(modulo('src/comun/groups.js'));

// Un producto de Sephora en un grupo con variantes y sus variantes ya leídas (caché).
const lista = structuredClone(collected);
lista['sephora:P999999'] = { asin: 'P999999', variante: '1111111', ecomerce: 'Sephora', nombre: 'Labial tonos', marca: 'Rare', precio: '20', link: 'https://www.sephora.com/product/labial-P999999?skuId=1111111', grupo: 'g1', codCategoria: 'CF010101', categoria: 'Electrónica', categoriaSecundaria: 'Audio', categoriaTerciaria: 'Audífonos' };
const variantesLeidas = {
  'sephora:P999999': {
    variantes: [{ sku: '1111111', atributos: ['Rojo'] }, { sku: '2222222', atributos: ['Azul'] }, { sku: '3333333', atributos: ['Verde'] }],
    dims: [], fecha: Date.now(), version: 5,
  },
};

// Service worker falso: aplica los cambios en el storage como lo haría cambiarLista.
async function onMessage(m, store) {
  const { collected: c, groups: g } = store.local;
  if (m.type === 'quitarProductos') return { quitados: quitarDeLista(c, g, m.claves) };
  if (m.type === 'restaurarProductos') return { restaurados: restaurarEnLista(c, g, m.quitados) };
  if (m.type === 'cambiarGuiaTalla') { cambiarGuiaTalla(g, m.grupo, m.valor); return { ok: true }; }
  return null;
}

const { $, w, store, log } = montar('src/preview/preview.html', { local: { collected: lista, groups, variantesLeidas }, onMessage });
await import(modulo('src/preview/preview.js'));
await until(() => $('rows').querySelector('.ghead'), 'render');
await tick(300);
const tarjetaDe = nombre => [...$('rows').querySelectorAll('.prod')].find(c => c.querySelector('.nombre')?.textContent === nombre);
const click = e => e.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

test('variantes en caché: botón y desplegable', async () => {
  $('search').value = 'Labial tonos';
  $('search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(100);
  const card = tarjetaDe('Labial tonos');
  assert.ok(card, 'tarjeta del producto con variantes');
  const boton = [...card.querySelectorAll('button.toggle')].find(b => /Ver 3 variantes/.test(b.textContent));
  assert.ok(boton, 'botón "▸ Ver 3 variantes"');
  click(boton);
  await tick(100);
  const panel = tarjetaDe('Labial tonos').querySelector('.vars');
  assert.ok(panel, 'desplegable abierto');
  assert.match(panel.querySelector('.t').textContent, /creará 3 variantes/);
  assert.equal(panel.querySelectorAll('.v').length, 3);
  assert.equal(panel.querySelector('.v.este .attrs')?.textContent, 'Rojo', 'la que va al Excel (skuId del link)');
  $('search').value = '';
  $('search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(100);
});

test('quitar un producto y deshacer', async () => {
  const antes = Object.keys(store.local.collected).length;
  $('search').value = 'Reloj';
  $('search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(100);
  click(tarjetaDe('Reloj').querySelector('button.quitar'));
  await until(() => !$('confirmBox').hidden, 'confirmación');
  assert.match($('confirmText').textContent, /¿Quitar «Reloj»/);
  click($('confirmOnly'));
  await until(() => !$('undoBar').hidden, 'aviso de deshacer');
  assert.match($('undoText').textContent, /Se quitó 1 producto/);
  assert.equal(Object.keys(store.local.collected).length, antes - 1);
  await tick(100);
  assert.ok(!tarjetaDe('Reloj'), 'la tarjeta ya no está');
  click($('undoBtn'));
  await until(() => /Volvió 1 producto/.test($('undoText').textContent), 'deshacer');
  assert.equal(Object.keys(store.local.collected).length, antes);
  await tick(100);
  assert.ok(tarjetaDe('Reloj'), 'la tarjeta volvió');
  $('search').value = '';
  $('search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(100);
});

test('guía de tallas del grupo: desactivar pide confirmación', async () => {
  const cabecera = [...$('rows').querySelectorAll('.ghead')].find(h => h.querySelector('h2')?.textContent === 'Labiales');
  const boton = cabecera.querySelector('.gguia');
  assert.match(boton.textContent, /Con guía de tallas/);
  click(boton);
  await until(() => !$('confirmBox').hidden, 'confirmación');
  click($('confirmOnly'));
  await until(() => /desactivada en «Labiales»/.test($('undoText').textContent), 'aviso');
  assert.equal(store.local.groups.g2.guiaTalla, false);
  assert.ok(log.messages.some(m => m.type === 'cambiarGuiaTalla' && m.grupo === 'g2' && m.valor === false));
});
