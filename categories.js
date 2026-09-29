// Categorías del sistema COMPRAFACIL (3 niveles + código).
// GET {apiUrl}/category/list/full-path  con  Authorization: <JWT> (sin "Bearer").
// La lista se guarda en caché y se refresca una vez al día; si la API falla se
// sigue usando la última lista descargada.

import { getConfig } from './config.js';

const SETTINGS_KEY = 'cfApi';
const CACHE_KEY = 'cfCategories';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// La URL viene de la configuración (categoriesApiUrl) salvo que se cambie en Opciones.
export async function getApiSettings() {
  const { [SETTINGS_KEY]: s = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  const { categoriesApiUrl = '' } = await getConfig();
  return { token: '', ...s, apiUrl: s.apiUrl || categoriesApiUrl };
}

export async function saveApiSettings(patch) {
  const current = await getApiSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } });
}

export async function getCachedCategories() {
  const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
  return cache || { items: [], fetchedAt: null, error: null };
}

export async function fetchCategories() {
  const { apiUrl, token } = await getApiSettings();
  if (!apiUrl) throw new Error('Falta la URL de la API en Opciones.');
  if (!token) throw new Error('Falta el token de acceso en Opciones.');

  let res;
  try {
    res = await fetch(`${apiUrl.replace(/\/+$/, '')}/category/list/full-path`, {
      headers: { Authorization: token.replace(/^Bearer\s+/i, '').trim() },
      cache: 'no-store',
    });
  } catch {
    throw new Error('No se pudo conectar con la API.');
  }
  if (res.status === 401) throw new Error('Token inválido o caducado. Inicia sesión de nuevo y actualiza el token.');
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.status || !Array.isArray(body.data)) {
    throw new Error(body?.message || `La API respondió HTTP ${res.status}.`);
  }

  const items = body.data
    .filter(c => c?.codigo && c.primaria && c.secundaria && c.terciaria)
    .map(({ codigo, primaria, secundaria, terciaria, ruta }) => ({
      codigo, primaria, secundaria, terciaria,
      ruta: ruta || `${primaria} > ${secundaria} > ${terciaria}`,
    }));
  const cache = { items, fetchedAt: new Date().toISOString(), error: null };
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
  return cache;
}

// Devuelve la lista en caché y la refresca si está vencida. Nunca lanza error:
// si falla, conserva la última lista y anota el motivo en `error`.
export async function getCategories({ force = false } = {}) {
  const cache = await getCachedCategories();
  const stale = !cache.fetchedAt || Date.now() - Date.parse(cache.fetchedAt) > MAX_AGE_MS;
  const { apiUrl, token } = await getApiSettings();
  if (!(force || stale) || !apiUrl || !token) return cache;
  try {
    return await fetchCategories();
  } catch (e) {
    const failed = { ...cache, error: e.message };
    await chrome.storage.local.set({ [CACHE_KEY]: failed });
    return failed;
  }
}

// Acepta la ruta completa ("Hogar > Menaje de Cocina > Juegos de ollas") o el código.
export function findCategory(items, text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;
  return items.find(c => c.ruta.toLowerCase() === t || c.codigo.toLowerCase() === t) || null;
}
