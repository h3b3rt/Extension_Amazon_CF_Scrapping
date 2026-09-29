// Preferencias de extracción. Activadas por defecto y editables solo desde Opciones.
export const DEFAULT_PREFS = {
  autoScroll: true,
  accumulate: true,
};

export async function getPrefs() {
  const { extractPrefs = {} } = await chrome.storage.local.get('extractPrefs');
  return { ...DEFAULT_PREFS, ...extractPrefs };
}

export async function setPref(key, value) {
  const prefs = await getPrefs();
  await chrome.storage.local.set({ extractPrefs: { ...prefs, [key]: value } });
}
