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

// Configuración efectiva para un sitio: la general con lo propio del sitio encima.
export function siteConfig(config, site) {
  const { id, name, title, hosts, homeUrl, ...own } = site;
  return { ...config, ...own, site: { id, name } };
}

export const siteTitle = site => site.title || `${site.name} Product Scraper`;

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
