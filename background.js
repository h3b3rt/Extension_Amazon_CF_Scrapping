import { refreshRemoteConfig } from './config.js';

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

// Si la extensión se instala desde Chrome Web Store o por política con
// update_url, aplica la nueva versión en cuanto Chrome la descargue.
chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload());
