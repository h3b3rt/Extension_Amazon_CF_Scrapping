// Popup en jsdom con un chrome falso: en una página de Michael Kors, elegir categoría
// con el buscador y pulsar "Extraer" encola el trabajo con esa categoría.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, modulo, until, tick } from './apoyo/chrome-falso.mjs';

const items = [
  { codigo: 'CF010101', primaria: 'Electrónica', secundaria: 'Audio', terciaria: 'Audífonos' },
  { codigo: 'CF090106', primaria: 'Moda Mujer', secundaria: 'Accesorios para Mujer', terciaria: 'Relojes para Mujer' },
];

test('popup: icono del sitio, categoría y Extraer', async () => {
  const { $, w, log } = montar('src/popup/popup.html', {
    local: { cfCategories: { items, fetchedAt: new Date().toISOString(), source: 'github', error: null }, categoryMode: 'search' },
    tab: { id: 1, url: 'https://www.michaelkors.com/women/watches/', title: 'Watches | Michael Kors' },
  });
  await import(modulo('src/popup/popup.js'));
  await until(() => $('version').textContent, 'init');
  await tick(200);
  assert.match($('appIcon').src, /^chrome-extension:\/\/test\/assets\/icons\/sitios\/michaelkors-32\.png$/);

  $('scrape').click();
  await until(() => !$('categoryForm').hidden, 'formulario');
  const input = $('categoryPicker').querySelector('.sc-input');
  assert.equal(input.value, '', 'la categoría empieza vacía');
  input.value = 'reloj';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick(100);
  assert.equal(input.value, 'Moda Mujer / Accesorios para Mujer / Relojes para Mujer');

  $('categoryForm').querySelector('button[type=submit]').click();
  await until(() => log.messages.some(m => m.type === 'enqueue'), 'enqueue');
  const job = log.messages.find(m => m.type === 'enqueue').job;
  assert.equal(job.cat.codigo, 'CF090106');
});
