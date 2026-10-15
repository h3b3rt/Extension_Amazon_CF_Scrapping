// Extracción sobre páginas guardadas de Chrome real (tests/casos.json): el resultado
// debe ser idéntico a su "foto" (tests/html/fotos/). Es la red de seguridad para
// cambiar scraper.js y familias.js sin cambiar lo que extraen.
//
// - Las páginas y las fotos están en tests/html/, fuera de Git (el repo es público):
//   sin ellas, estas pruebas se omiten.
// - Una foto que no existe se crea con el resultado actual (y la prueba lo avisa).
// - Para aceptar un cambio de resultado a propósito: ACTUALIZAR_FOTOS=1 npm test.
//
// Por página: extracción sin "Extraer variantes"; en páginas de producto, también con
// variantes (familias) y las variantes que lee la vista previa (lectores-variantes.js,
// con la misma página como respuesta y sin red para el resto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, modulo } from './apoyo/chrome-falso.mjs';
import { extraer, foto, configDe } from './apoyo/extraer.mjs';

const HTML = path.join(REPO, 'tests', 'html');
const FOTOS = path.join(HTML, 'fotos');
const ACTUALIZAR = process.env.ACTUALIZAR_FOTOS === '1';
const { paginas } = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'casos.json'), 'utf8'));
const { leeVariantes, descargarVariantes } = await import(modulo('src/comun/lectores-variantes.js'));

// Variantes que la vista previa leería del producto: la descarga de su link devuelve
// la página guardada; cualquier otra URL (otros colores de Marc Jacobs) da 404.
// Sin pausa entre descargas (Marc Jacobs baja una página por color).
async function variantesDe(html, p) {
  const limpia = u => String(u).split('#')[0];
  const { fetch: fetchReal } = globalThis;
  const pausaReal = globalThis.__cfFamilias.pausa;
  globalThis.fetch = async u => (limpia(u) === limpia(p.link) ? new Response(html, { status: 200 }) : new Response('', { status: 404 }));
  globalThis.__cfFamilias.pausa = () => 0;
  try {
    return JSON.parse(JSON.stringify(leeVariantes(p) ? await descargarVariantes(p) : null));
  } finally {
    globalThis.fetch = fetchReal;
    globalThis.__cfFamilias.pausa = pausaReal;
  }
}

function comparar(t, archivo, actual) {
  const ruta = path.join(FOTOS, `${archivo}.json`);
  const existia = fs.existsSync(ruta);
  if (ACTUALIZAR || !existia) {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, `${JSON.stringify(actual, null, 1)}\n`);
    t.diagnostic(`foto ${existia ? 'actualizada' : 'creada'}: ${archivo}`);
    return;
  }
  assert.deepStrictEqual(actual, JSON.parse(fs.readFileSync(ruta, 'utf8')), `${archivo}: el resultado cambió respecto de su foto`);
}

for (const { archivo, url } of paginas) {
  const ruta = path.join(HTML, archivo);
  test(`extracción: ${archivo}`, { skip: !fs.existsSync(ruta) && 'sin la página guardada (tests/html/)' }, async t => {
    const sin = await extraer(ruta, url);
    assert.ok(!sin.error, sin.error);
    const actual = { url, sinVariantes: foto(sin) };
    if (sin.tipoPagina) {
      actual.conVariantes = foto(await extraer(ruta, url, { variaciones: true }));
      const p = sin.productos[0];
      if (p) actual.variantes = await variantesDe(fs.readFileSync(ruta, 'utf8'), { ...p, ecomerce: configDe(url).site.name });
    }
    comparar(t, archivo, actual);
  });
}

// Paginación sin red: la página abierta y las siguientes (otra página guardada del mismo
// sitio) con el límite del caso; la foto incluye las URL que se pidieron.
const { paginacion = [] } = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'casos.json'), 'utf8'));
for (const { archivo, url, siguiente, opciones } of paginacion) {
  const ruta = path.join(HTML, archivo);
  const otra = path.join(HTML, siguiente);
  const nombre = `paginacion/${archivo.replace(/\.html$/, '')}-${Object.entries(opciones).map(([k, v]) => `${k}${v}`).join('-')}`;
  test(`paginación: ${archivo} (${JSON.stringify(opciones)})`, { skip: !(fs.existsSync(ruta) && fs.existsSync(otra)) && 'sin las páginas guardadas (tests/html/)' }, async t => {
    const r = await extraer(ruta, url, { opciones, siguiente: otra });
    assert.ok(!r.error, r.error);
    comparar(t, nombre, { url, siguiente, opciones, resultado: foto(r) });
  });
}
