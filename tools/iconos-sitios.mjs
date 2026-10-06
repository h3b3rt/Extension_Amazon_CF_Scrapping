// Genera los iconos por sitio (icons/sitios/<id>-16.png y -32.png): el favicon del
// sitio dentro de un marco naranja redondeado (el color del icono general).
// Solo para desarrollo; la extensión usa los PNG ya generados.
//
// Uso: node tools/iconos-sitios.mjs <carpeta-con-favicons>
// La carpeta tiene un archivo por sitio con el id de config.sites como nombre
// (amazon.png, sephora.jpg…). Un favicon se obtiene, por ejemplo, de
// https://www.google.com/s2/favicons?domain=sephora.com&sz=128
// Usa Chrome, Edge o Brave sin interfaz para dibujar en un canvas.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const SALIDA = path.join(REPO, 'icons', 'sitios');
const TAMANOS = [16, 32];
const NAVEGADORES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
];

const carpeta = process.argv[2];
if (!carpeta) throw new Error('Falta la carpeta con los favicons.');
const navegador = NAVEGADORES.find(f => fs.existsSync(f));
if (!navegador) throw new Error('No se encontró Chrome, Edge ni Brave.');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const fuentes = fs.readdirSync(carpeta).filter(f => MIME[path.extname(f).toLowerCase()]).map(f => ({
  id: path.basename(f, path.extname(f)),
  url: `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(carpeta, f)).toString('base64')}`,
}));
if (!fuentes.length) throw new Error('La carpeta no tiene imágenes.');

// Imágenes en data: (no "ensucian" el canvas); el resultado queda en <pre id="out">.
const html = `<!DOCTYPE html><meta charset="utf-8"><pre id="out"></pre><script>
const fuentes = ${JSON.stringify(fuentes)};
const tamanos = ${JSON.stringify(TAMANOS)};
const cargar = url => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
function redondeado(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
(async () => {
  const res = {};
  for (const f of fuentes) {
    const img = await cargar(f.url);
    for (const s of tamanos) {
      const cv = Object.assign(document.createElement('canvas'), { width: s, height: s });
      const c = cv.getContext('2d');
      c.imageSmoothingQuality = 'high';
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#FFB53D'); g.addColorStop(1, '#F28C00');
      redondeado(c, 0, 0, s, s, s * 0.22); c.fillStyle = g; c.fill();
      const borde = Math.max(1.5, s * 0.09);
      redondeado(c, borde, borde, s - 2 * borde, s - 2 * borde, s * 0.14); c.fillStyle = '#fff'; c.fill();
      const m = borde + Math.max(0.5, s * 0.05);
      const lado = s - 2 * m;
      const k = Math.min(lado / img.width, lado / img.height);
      const w = img.width * k, h = img.height * k;
      c.save(); redondeado(c, borde, borde, s - 2 * borde, s - 2 * borde, s * 0.14); c.clip();
      c.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
      c.restore();
      res[f.id + '-' + s] = cv.toDataURL('image/png');
    }
  }
  document.getElementById('out').textContent = JSON.stringify(res);
})();
</script>`;

const tmp = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '.', 'iconos-'));
const pagina = path.join(tmp, 'iconos.html');
fs.writeFileSync(pagina, html);
const dom = execFileSync(navegador, ['--headless=new', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'perfil')}`,
  '--virtual-time-budget=5000', '--dump-dom', `file:///${pagina.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
const json = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1];
if (!json) throw new Error('El navegador no generó los iconos.');
const res = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
fs.mkdirSync(SALIDA, { recursive: true });
for (const [nombre, url] of Object.entries(res)) {
  fs.writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`icons/sitios/${nombre}.png`);
}
fs.rmSync(tmp, { recursive: true, force: true });
