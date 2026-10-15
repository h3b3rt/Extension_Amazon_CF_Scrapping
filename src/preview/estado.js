// Estado de la vista previa compartido por sus módulos (preview.js, panel-variantes.js y
// acciones.js) y las piezas que usan todos. Ninguno de esos módulos importa preview.js:
// la vista se registra con conectar({ render, renderFilas, renderResumen }).
import { el } from '../comun/dom.js';
import '../inyectados/familias.js';

// datos: lo calculado por cargar() en preview.js; config: la configuración;
// seleccion: claves marcadas con las casillas; tecnico: "Ver datos técnicos".
export const estado = { datos: null, config: null, seleccion: new Set(), tecnico: false };

// Funciones de dibujado de preview.js (las llaman los otros módulos tras un cambio).
export const vista = { render: async () => {}, renderFilas: () => {}, renderResumen: () => {} };
export function conectar(funciones) { Object.assign(vista, funciones); }

export const esHttps = u => /^https:\/\//i.test(u || '');

export const ecomerceDe = (p, X) => p.ecomerce || X.ecomerce || 'Amazon';
export const idDe = (p, X) => `${ecomerceDe(p, X)}|${(p.asin || '').trim()}`;
// Misma clave de familia que unoPorFamilia (familias.js).
export const familiaDe = (p, X) => (p.familia ? `${ecomerceDe(p, X)}:${p.familia}` : '');

// ¿El producto representa una familia en el Excel? (Amazon de grupos con variantes,
// Kate Spade siempre; ver familias.js). El sistema crea toda la familia desde él.
export function representaFamilia(p) {
  const Fam = globalThis.__cfFamilias;
  return !!p.familia && estado.datos.filas.some(f => f.producto.clave === p.clave)
    && Fam.agrupa(Fam.porEcomerce(estado.config), p, p.conVariaciones);
}

// Productos de la lista de un grupo (van o no al Excel), con su clave.
export const productosDelGrupo = nombre => [...estado.datos.filas.map(f => f.producto), ...estado.datos.fuera.map(x => x.p)].filter(p => p.clave && p.grupo === nombre);

// Las <img> se reutilizan entre dibujados (renderFilas rehace la lista): una imagen
// nueva, aun en caché, se ve vacía un instante y la página parpadea.
const imagenes = new Map();
let pasada = 0;
// Cada dibujado de la lista es una pasada nueva (ver foto).
export const nuevaPasada = () => { pasada++; };

// Foto del producto o de una variante (cuadro gris si no hay).
export function foto(src, link) {
  const box = el('div', { className: 'foto' });
  if (esHttps(src)) {
    let img = imagenes.get(src);
    // La misma imagen dos veces en un dibujado: la segunda es otra <img>.
    if (!img || img.dataset.pasada === String(pasada)) {
      // referrerPolicy antes que src: cambiarlo después vuelve a pedir la imagen.
      img = el('img', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src });
      const esta = img;
      img.onerror = () => { if (imagenes.get(src) === esta) imagenes.delete(src); esta.replaceWith('Sin imagen'); };
      if (!imagenes.has(src)) imagenes.set(src, img);
    }
    img.dataset.pasada = pasada;
    box.append(img);
  } else box.append('Sin imagen');
  if (!link) return box;
  return el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: link }, box);
}
