// Cada ruta que usa la extensión existe: manifest, scripts inyectados, getURL, HTML e imports.
// Cada import con nombre se exporta en su módulo y se usa en el archivo que lo importa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './apoyo/chrome-falso.mjs';

const leer = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const existe = rel => fs.existsSync(path.join(REPO, rel));
const archivos = (dir, ext) => fs.readdirSync(path.join(REPO, dir), { recursive: true })
  .map(f => path.posix.join(dir, f.replace(/\\/g, '/'))).filter(f => f.endsWith(ext));
const JS = archivos('src', '.js');
const HTML = archivos('src', '.html');

test('manifest: service worker, páginas e iconos existen', () => {
  const m = JSON.parse(leer('manifest.json'));
  const rutas = [m.background.service_worker, m.action.default_popup, m.options_page,
    ...Object.values(m.icons), ...Object.values(m.action.default_icon)];
  for (const r of rutas) assert.ok(existe(r), `falta ${r}`);
});

test('getURL y executeScript apuntan a archivos del paquete', () => {
  for (const f of JS) {
    const s = leer(f);
    for (const [, r] of s.matchAll(/getURL\(['`]([^'`$?]+)/g)) assert.ok(existe(r), `${f}: getURL('${r}') no existe`);
    for (const [, lista] of s.matchAll(/files:\s*\[([^\]]+)\]/g)) {
      for (const [, r] of lista.matchAll(/'([^']+)'/g)) assert.ok(existe(r), `${f}: executeScript ${r} no existe`);
    }
  }
});

test('iconos de sites.js: rutas absolutas que existen', () => {
  const s = leer('src/comun/sites.js');
  for (const [, r] of s.matchAll(/'(\/assets\/icons\/[^']+)'/g)) assert.ok(existe(r.slice(1)), `falta ${r}`);
  const sitios = JSON.parse(leer('config.default.json')).sites;
  for (const site of sitios) {
    const id = site.icono || site.id;
    for (const t of [16, 32]) assert.ok(existe(`assets/icons/sitios/${id}-${t}.png`), `falta el icono ${id}-${t}`);
  }
});

test('HTML: src y href locales existen', () => {
  for (const f of HTML) {
    for (const [, r] of leer(f).matchAll(/\b(?:src|href)="([^"#:]+)"/g)) {
      const destino = r.startsWith('/') ? r.slice(1) : path.posix.join(path.posix.dirname(f), r);
      assert.ok(existe(destino), `${f}: ${r} no existe`);
    }
  }
});

test('imports: el archivo existe, el nombre se exporta y se usa', () => {
  const exportados = f => {
    const s = leer(f);
    return new Set([...s.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm)].map(m => m[1]));
  };
  for (const f of JS) {
    const s = leer(f);
    for (const m of s.matchAll(/^import\s*(?:\{([^}]+)\}\s*from\s*)?'(\.[^']+)'/gm)) {
      const destino = path.posix.join(path.posix.dirname(f), m[2]);
      assert.ok(existe(destino), `${f}: import ${m[2]} no existe`);
      for (const raw of (m[1] || '').split(',').map(x => x.trim()).filter(Boolean)) {
        const [orig, local = orig] = raw.split(/\s+as\s+/);
        assert.ok(exportados(destino).has(orig), `${f}: ${orig} no se exporta en ${destino}`);
        const usos = s.split(new RegExp(`(?<![\\w$.])${local.replace('$', '\\$')}(?![\\w$])`)).length - 1;
        assert.ok(usos >= 2, `${f}: ${local} se importa y no se usa`);
      }
    }
  }
});

test('empaquetado: release.yml incluye src, assets y la raíz necesaria', () => {
  const y = leer('.github/workflows/release.yml');
  for (const r of ['manifest.json', 'config.default.json', 'categories.json', 'assets/plantilla.xlsx', 'assets/icons/*.png', 'assets/icons/sitios/*.png', 'src/*/*.js', 'src/*/*.html']) {
    assert.ok(y.includes(r), `release.yml no incluye ${r}`);
  }
  const lista = y.slice(y.indexOf('zip "dist/'), y.indexOf('- name: Publicar'));
  assert.ok(!/(^|\s)config\.json\b/.test(lista), 'config.json no va en el paquete');
});
