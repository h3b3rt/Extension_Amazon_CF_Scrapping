import { getConfig, refreshRemoteConfig } from './config.js';
import { appName, findSite, siteTitle } from './sites.js';

const SYNC_ALARM = 'config-sync';
const SYNC_MINUTES = 180;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
  refreshRemoteConfig();
});

chrome.runtime.onStartup.addListener(() => refreshRemoteConfig());

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SYNC_ALARM) refreshRemoteConfig();
});

// Nombre del icono según el sitio de la pestaña ("Michael Kors Product Scraper").
// Chrome solo da la URL de los sitios con permiso; en el resto queda el nombre general.
async function updateTitle(tabId, url) {
  const config = await getConfig();
  const site = url ? findSite(config, url) : null;
  await chrome.action.setTitle({ tabId, title: site ? siteTitle(site) : appName(config) });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(tab => updateTitle(tabId, tab.url)).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') updateTitle(tabId, tab.url).catch(() => {});
});

// Si la extensión se instala desde Chrome Web Store o por política con
// update_url, aplica la nueva versión en cuanto Chrome la descargue.
chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload());
