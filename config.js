// Configuración de selectores y formato CSV.
// Se empaqueta una versión por defecto (config.default.json) y se puede
// sobrescribir con una remota. La remota solo contiene DATOS (selectores,
// columnas, avisos): Manifest V3 no permite ejecutar código descargado.

export const SCHEMA_VERSION = 1;
const REMOTE_KEY = 'remoteConfig';
const META_KEY = 'configMeta';
const SETTINGS_KEY = 'settings';

export const extensionVersion = () => chrome.runtime.getManifest().version;

export function compareVersions(a = '0', b = '0') {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// Devuelve '' si la configuración es utilizable, o el motivo del rechazo.
export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'No es un objeto JSON.';
  if (cfg.schemaVersion !== SCHEMA_VERSION) return `schemaVersion ${cfg.schemaVersion} no soportado (se esperaba ${SCHEMA_VERSION}).`;
  if (cfg.minExtensionVersion && compareVersions(extensionVersion(), cfg.minExtensionVersion) < 0) {
    return `Requiere la extensión ${cfg.minExtensionVersion} o superior.`;
  }
  if (!Array.isArray(cfg.layouts) || !cfg.layouts.length || cfg.layouts.some(l => !l?.id || typeof l.item !== 'string')) {
    return 'El campo "layouts" es inválido.';
  }
  if (!Array.isArray(cfg.csv?.headers) || !cfg.csv.headers.length || typeof cfg.csv.fields !== 'object') {
    return 'El campo "csv" es inválido.';
  }
  return '';
}

let defaultConfig;
export function getDefaultConfig() {
  defaultConfig ??= fetch(chrome.runtime.getURL('config.default.json')).then(r => r.json());
  return defaultConfig;
}

export async function getSettings() {
  const { [SETTINGS_KEY]: saved = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  const def = await getDefaultConfig();
  return { configUrl: def.remoteConfigUrl || '', ...saved };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } });
}

export async function getConfigMeta() {
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  return meta || null;
}

// Configuración efectiva: la remota si es válida y no es más antigua que la
// incluida en la extensión (evita que una caché vieja pise selectores nuevos).
export async function getConfig() {
  const def = await getDefaultConfig();
  const { [REMOTE_KEY]: remote } = await chrome.storage.local.get(REMOTE_KEY);
  if (remote && !validateConfig(remote) && (remote.revision || 0) >= (def.revision || 0)) {
    return { ...remote, _source: 'remota' };
  }
  return { ...def, _source: 'incluida' };
}

export async function refreshRemoteConfig() {
  const { configUrl } = await getSettings();
  const meta = { checkedAt: new Date().toISOString(), url: configUrl };
  if (!configUrl) {
    await chrome.storage.local.set({ [META_KEY]: { ...meta, error: 'No hay URL de configuración remota.' } });
    return { ok: false, error: 'No hay URL de configuración remota.' };
  }
  try {
    const res = await fetch(configUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    const problem = validateConfig(cfg);
    if (problem) throw new Error(problem);
    await chrome.storage.local.set({ [REMOTE_KEY]: cfg, [META_KEY]: { ...meta, ok: true, revision: cfg.revision } });
    return { ok: true, config: cfg };
  } catch (e) {
    const error = e.message || String(e);
    await chrome.storage.local.set({ [META_KEY]: { ...meta, error } });
    return { ok: false, error };
  }
}

export async function resetRemoteConfig() {
  await chrome.storage.local.remove([REMOTE_KEY, META_KEY]);
}
