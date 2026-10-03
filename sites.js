// Sitios soportados (config.sites). Cada sitio sobrescribe las claves generales de
// la configuración (layouts, pageTypes, price, image, history…) con las suyas; sin
// sobrescribir, usa las generales, que son las de Amazon. Así la configuración de
// Amazon queda donde estaba y las versiones anteriores la siguen leyendo igual.

export const APP_NAME = 'COMPRAFACIL Scraper';
const DEFAULT_SITES = [{ id: 'amazon', name: 'Amazon', hosts: ['amazon.com'], homeUrl: 'https://www.amazon.com/', ecomerce: 'Amazon' }];
const list = v => (Array.isArray(v) ? v : v ? [v] : []);

export const appName = config => config?.appName || APP_NAME;

export function sitesOf(config) {
  return Array.isArray(config?.sites) && config.sites.length ? config.sites : DEFAULT_SITES;
}

// Sitio de una URL (https y dominio del sitio o un subdominio), o null.
export function findSite(config, url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  return sitesOf(config).find(s => list(s.hosts).some(h => host === h || host.endsWith(`.${h}`))) || null;
}

// Versión de otra región de un sitio (p. ej. sephora.fr o sephora.com/ca/en/...):
// { site, target } con la página equivalente en el sitio de EE. UU., o null.
// - Mismo dominio con prefijo de región (pathPrefix): misma ruta sin el prefijo.
// - Otro dominio (hostPattern): los productos tienen otros ID, así que se busca en
//   el sitio de EE. UU. por el término de búsqueda de la URL o por el título.
export function regionRedirect(config, url, title = '') {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  const test = (p, v) => { try { return !!p && new RegExp(p, 'i').test(v); } catch { return false; } };
  for (const site of sitesOf(config)) {
    const R = site.regions;
    if (!R || !/^https:\/\//i.test(site.homeUrl || '')) continue;
    const home = new URL(site.homeUrl);
    const propio = list(site.hosts).some(h => host === h || host.endsWith(`.${h}`));
    // Mismo dominio con otra región cuyas rutas no se corresponden (Marc Jacobs:
    // /es-es/los-zapatos/…): se abre la portada de EE. UU. (`homeUrl`).
    if (propio && test(R.otherPath, u.pathname)) return { site, target: home.href, portada: true };
    if (propio && R.pathPrefix) {
      let path = u.pathname;
      try { path = path.replace(new RegExp(R.pathPrefix, 'i'), ''); } catch { continue; }
      if (path !== u.pathname) return { site, target: `${home.origin}${path || '/'}${u.search}` };
    }
    if (propio || !test(R.hostPattern, host)) continue;
    let q = '';
    for (const k of list(R.queryParams)) { q = u.searchParams.get(k)?.trim() || ''; if (q) break; }
    if (!q) {
      q = title;
      for (const p of list(R.titleStrip)) { try { q = q.replace(new RegExp(p, 'i'), ''); } catch { /* patrón remoto inválido */ } }
      q = q.trim();
    }
    const target = q && R.searchUrl ? R.searchUrl.replace('{q}', encodeURIComponent(q)) : home.href;
    return { site, target, query: q };
  }
  return null;
}

// Configuración efectiva para un sitio: la general con lo propio del sitio encima.
export function siteConfig(config, site) {
  const { id, name, title, hosts, homeUrl, regions, ...own } = site;
  return { ...config, ...own, site: { id, name } };
}

// Verificación de familias de Amazon (config.familias del sitio), o null si no está activa.
export function familiasConfig(config) {
  const amazon = sitesOf(config).find(s => s.id === 'amazon');
  return (amazon && siteConfig(config, amazon).familias) || null;
}

export const siteTitle =site => site.title || `${site.name} Product Scraper`;

// Clave del producto en la lista: el SKU solo para Amazon (como en versiones
// anteriores) y "sitio:SKU" para los demás, para que dos sitios no choquen.
export const productKey = (site, sku) => (site.id === 'amazon' ? sku : `${site.id}:${sku}`);

// Sugerencia de nombre de grupo: el parámetro de búsqueda (p. ej. "q=boots") o el
// título de la pestaña sin el sufijo del sitio.
export function pageLabel(site, url, title) {
  const G = site.groupName || {};
  if (G.param) {
    try {
      const v = new URL(url).searchParams.get(G.param);
      if (v?.trim()) return v.trim();
    } catch { /* URL inválida */ }
  }
  let t = title || '';
  for (const p of list(G.strip)) {
    try { t = t.replace(new RegExp(p, 'i'), ''); } catch { /* patrón remoto inválido */ }
  }
  return t.trim();
}

// ¿La URL es una página especial (p. ej. de producto) según su urlPattern?
export function pageTypeByUrl(cfg, url) {
  let path = '';
  try { path = new URL(url).pathname; } catch { return null; }
  return list(cfg.pageTypes).find(t => {
    try { return t.urlPattern && new RegExp(t.urlPattern, 'i').test(path); } catch { return false; }
  }) || null;
}
