// Grupos de la lista: cada pulsación de "Extraer" crea uno. Su nombre sale en la
// columna ref_grupo del Excel para distinguir las extracciones del archivo unificado.
// Viven en chrome.storage.local ("groups", { id: grupo }) junto a la lista
// ("collected"); cada producto guarda el id de su grupo en `grupo`.
import { normalizeText } from './categories.js';

export const MAX_GROUP_NAME = 60;
const DEFAULT_NAME_LENGTH = 40;
const FALLBACK_NAME = 'Sin grupo';

export const cleanGroupName = name => (name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME);

// Los nombres no se repiten (sin distinguir mayúsculas ni tildes).
export function nameTaken(groups, name, exceptIds = []) {
  const key = normalizeText(cleanGroupName(name));
  return Object.entries(groups).some(([id, g]) => !exceptIds.includes(id) && normalizeText(g.nombre) === key);
}

// "Amazon.com: Apple AirPods Pro (2ª generación) … : Electrónica" -> "Apple AirPods Pro (2ª generación)".
function titleName(title) {
  let t = (title || '').replace(/\s+/g, ' ').trim().replace(/^Amazon\.com\s*:\s*/i, '');
  const sinSeccion = t.replace(/\s+:\s+[^:]+$/, '');
  if (sinSeccion) t = sinSeccion;
  if (t.length > DEFAULT_NAME_LENGTH) {
    const corte = t.slice(0, DEFAULT_NAME_LENGTH);
    t = (corte.includes(' ') ? corte.slice(0, corte.lastIndexOf(' ')) : corte).replace(/[\s,;:(-]+$/, '');
  }
  return t;
}

// Título de la página recortado; si no hay título, "Grupo N". Si el nombre ya
// existe se agrega " (2)", " (3)"…
export function defaultGroupName(title, groups, exceptIds = []) {
  const base = titleName(title) || `Grupo ${Object.keys(groups).length - exceptIds.length + 1}`;
  let name = base;
  for (let n = 2; nameTaken(groups, name, exceptIds); n++) name = `${base} (${n})`;
  return name;
}

export const newGroupId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Productos de versiones anteriores (sin grupo): un grupo por página de origen,
 * con el título guardado en el historial. Borra los grupos que quedaron vacíos.
 * Modifica `collected` y `groups`; devuelve true si cambió algo.
 */
export function syncGroups(collected, groups, history = {}) {
  let changed = false;
  const porOrigen = new Map();
  for (const p of Object.values(collected)) {
    if (p.grupo && groups[p.grupo]) continue;
    const origen = p.origen || '';
    if (!porOrigen.has(origen)) {
      const id = newGroupId() + porOrigen.size;
      const h = history[origen];
      groups[id] = { nombre: defaultGroupName(h?.titulo, groups), origen, fecha: h?.fecha || '', titulo: h?.titulo || '' };
      porOrigen.set(origen, id);
    }
    p.grupo = porOrigen.get(origen);
    changed = true;
  }
  const usados = new Set(Object.values(collected).map(p => p.grupo));
  for (const id of Object.keys(groups)) {
    if (!usados.has(id)) { delete groups[id]; changed = true; }
  }
  return changed;
}

// Grupos en orden de extracción.
export const sortedGroups = groups => Object.entries(groups)
  .map(([id, g]) => ({ id, ...g }))
  .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// Opciones elegidas al extraer, fijas para todo el grupo: extraer variantes
// (columna variacion) y guía de tallas (guia_talla). Los grupos de versiones
// anteriores no las tienen: "No".
export const opcionesDe = g => ({ variaciones: g?.variaciones === true, guiaTalla: g?.guiaTalla === true });
export const siNo = b => (b ? 'Sí' : 'No');
export const opcionesTxt = o => `Variaciones: ${siNo(o.variaciones)} · Guía de tallas: ${siNo(o.guiaTalla)}`;

// Filas del Excel: agrupadas en orden de extracción, con el nombre del grupo
// (nunca vacío: una celda '' rompe la carga del backend) y sus opciones.
export function productsForExport(collected, groups) {
  const orden = new Map(sortedGroups(groups).map((g, i) => [g.id, i]));
  return Object.values(collected)
    .map((p, i) => ({ p, i, o: orden.get(p.grupo) ?? orden.size }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map(({ p }) => {
      const o = opcionesDe(groups[p.grupo]);
      return { ...p, grupo: groups[p.grupo]?.nombre || FALLBACK_NAME, variacion: siNo(o.variaciones), guiaTalla: siNo(o.guiaTalla), conVariaciones: o.variaciones };
    });
}
