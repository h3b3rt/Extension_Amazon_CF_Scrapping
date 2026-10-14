// El Excel leído como lo lee el backend (XLSX.sheet_to_json, sin opciones): sin celdas
// vacías, Amazon solo con sku y el resto solo con link, ecomerce sin espacios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { REPO, modulo } from './apoyo/chrome-falso.mjs';

const { buildWorkbook, filasExcel } = await import(modulo('src/comun/xlsx.js'));
const config = JSON.parse(fs.readFileSync(path.join(REPO, 'config.default.json'), 'utf8')).xlsx;
const base = { nombre: 'X', marca: 'M', precio: '10', grupo: 'g' };
const productos = [
  { ...base, asin: 'B0ABCDEFGH', ecomerce: 'Amazon', link: 'https://www.amazon.com/dp/B0ABCDEFGH' },
  { ...base, asin: 'P123456', ecomerce: 'Sephora', link: 'https://www.sephora.com/product/x-P123456?skuId=1' },
  { ...base, asin: 'H001M01SP21', ecomerce: 'Marc Jacobs', link: 'https://www.marcjacobs.com/us-en/x/H001M01SP21.html' },
  { ...base, asin: 'KP126', ecomerce: 'Kate Spade', link: 'https://www.katespade.com/products/x/KP126.html' },
  { ...base, asin: 'MK1', ecomerce: 'Michael Kors', link: 'https://www.michaelkors.com/x/MK1.html' },
];

test('filasExcel: sku solo en Amazon, link en el resto', () => {
  const { filas } = filasExcel(productos, config);
  assert.equal(filas.length, productos.length);
  for (const f of filas) {
    const amazon = f.sitio === 'Amazon';
    assert.equal(!!f.celdas.sku, amazon, `${f.sitio}: sku`);
    assert.equal(!!f.celdas.link, !amazon, `${f.sitio}: link`);
    assert.ok(!/\s/.test(f.celdas.ecomerce), `${f.celdas.ecomerce}: con espacios`);
  }
});

test('Excel leído como el backend', async () => {
  const plantilla = new Uint8Array(fs.readFileSync(path.join(REPO, 'assets/plantilla.xlsx')));
  const { bytes } = await buildWorkbook(plantilla, productos, { config, categories: [] });
  const libro = XLSX.read(bytes);
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]]);
  assert.equal(filas.length, productos.length);
  for (const fila of filas) {
    for (const [k, v] of Object.entries(fila)) assert.notEqual(v, '', `celda vacía en ${k}`);
    for (const col of ['marca', 'nombre', 'precio', 'peso']) assert.ok(!(col in fila), `columna del backend llena: ${col}`);
    if (fila.ecomerce === 'Amazon') {
      assert.equal(typeof fila.sku, 'string');
      assert.ok(!('link' in fila));
    } else {
      assert.ok(!('sku' in fila), `${fila.ecomerce} con sku`);
      assert.match(fila.link, /^https:\/\//);
    }
  }
  assert.deepEqual(filas.map(f => f.ecomerce), ['Amazon', 'Sephora', 'MarcJacobs', 'KateSpade', 'MichaelKors']);
});
