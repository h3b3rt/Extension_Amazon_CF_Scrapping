// Categorías del sistema COMPRAFACIL (3 niveles + código).
//
// Fuentes:
//   1. categories.json publicado en GitHub (config.categoriesUrl). Lo mantiene al
//      día el workflow "Actualizar categorías", que consulta la API del sistema
//      con un token guardado como secret del repositorio (nunca en la extensión).
//   2. categories.json incluido en la extensión: respaldo sin conexión.
// La lista se guarda en caché y se refresca cada hora o con el botón "Actualizar".
// Si la descarga falla, se sigue usando la última lista válida.

import { getConfig } from './config.js';

const CACHE_KEY = 'cfCategories';
const MAX_AGE_MS = 60 * 60 * 1000;

const SOURCE_LABELS = { github: 'GitHub', incluida: 'incluida en la extensión' };
export const sourceLabel = source => SOURCE_LABELS[source] || source || '—';

// Acepta la respuesta de la API ({ status, data: [...] }) o directamente la lista.
function parseList(body) {
  const data = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(data)) return null;
  return data
    .filter(c => c?.codigo && c.primaria && c.secundaria && c.terciaria)
    .map(({ codigo, primaria, secundaria, terciaria }) => ({ codigo, primaria, secundaria, terciaria }));
}

let bundled;
function loadBundled() {
  bundled ??= fetch(chrome.runtime.getURL('categories.json'))
    .then(res => res.json())
    .then(body => parseList(body) || [])
    .catch(() => []);
  return bundled;
}

async function fetchFromGithub() {
  const { categoriesUrl } = await getConfig();
  if (!categoriesUrl) throw new Error('Sin URL de categorías en la configuración.');
  let res;
  try {
    res = await fetch(categoriesUrl, { cache: 'no-store' });
  } catch {
    throw new Error('Sin conexión con GitHub.');
  }
  if (res.status === 404) throw new Error('La lista de categorías todavía no está publicada.');
  if (!res.ok) throw new Error(`GitHub respondió HTTP ${res.status}.`);
  const items = parseList(await res.json().catch(() => null));
  if (!items) throw new Error('El archivo de categorías no es válido.');
  if (!items.length) throw new Error('La lista de categorías publicada está vacía.');
  return items;
}

// Caché actual; si nunca se descargó nada, la lista incluida en la extensión.
export async function getCachedCategories() {
  const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
  if (cache?.items?.length) return cache;
  return { items: await loadBundled(), fetchedAt: null, source: 'incluida', error: cache?.error || null };
}

// Descarga la lista de GitHub. Nunca lanza error: si falla, conserva la última
// lista y anota el motivo en `error`.
export async function refreshCategories() {
  const cache = await getCachedCategories();
  try {
    const fresh = { items: await fetchFromGithub(), fetchedAt: new Date().toISOString(), source: 'github', error: null };
    await chrome.storage.local.set({ [CACHE_KEY]: fresh });
    return fresh;
  } catch (e) {
    const failed = { ...cache, error: e.message };
    await chrome.storage.local.set({ [CACHE_KEY]: failed });
    return failed;
  }
}

// Lista en caché, refrescada si está vencida (o siempre, con force).
export async function getCategories({ force = false } = {}) {
  const cache = await getCachedCategories();
  const stale = !cache.fetchedAt || Date.now() - Date.parse(cache.fetchedAt) > MAX_AGE_MS;
  return force || stale ? refreshCategories() : cache;
}

// Texto sin tildes, en minúsculas y con los separadores ">" o "/" unificados.
export function normalizeText(s) {
  return (s || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*[>/]\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Hogar / Menaje de Cocina / Juegos de ollas"
export function categoryLabel(c) {
  return `${c.primaria} / ${c.secundaria} / ${c.terciaria}`;
}

// Acepta la ruta con ">" o "/" (con o sin tildes) o el código.
export function findCategory(items, text) {
  const t = normalizeText(text);
  if (!t) return null;
  return items.find(c => normalizeText(categoryLabel(c)) === t || c.codigo.toLowerCase() === t) || null;
}

// Búsqueda mientras se escribe: todas las palabras deben aparecer (en cualquier
// orden) en la ruta o el código. Primero las que coinciden en el último nivel.
export function searchCategories(items, query, limit = 50) {
  const terms = normalizeText(query).split(' ').filter(t => t && t !== '/');
  if (!terms.length) return [];
  const results = [];
  for (const c of items) {
    const hay = `${normalizeText(categoryLabel(c))} ${c.codigo.toLowerCase()}`;
    if (!terms.every(t => hay.includes(t))) continue;
    const ultimo = normalizeText(c.terciaria);
    const score = terms.filter(t => ultimo.includes(t)).length * 2 + (ultimo.startsWith(terms[0]) ? 1 : 0);
    results.push({ c, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit).map(r => r.c);
}
