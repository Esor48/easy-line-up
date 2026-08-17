const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  onMapUpdate: (callback) => {
    ipcRenderer.on('map-update', (_event, mapName) => callback(mapName));
  },
  onRoundUpdate: (callback) => {
    ipcRenderer.on('round-update', (_event, data) => callback(data));
  },
  onMouseCaptureChanged: (callback) => {
    ipcRenderer.on('mouse-capture-changed', (_event, disabled) => callback(disabled));
  },
  getLineups: () => ipcRenderer.invoke('get-lineups'),
  getSpawnSmokes: () => ipcRenderer.invoke('get-spawn-smokes'),
  getSpawnOverview: () => ipcRenderer.invoke('get-spawn-overview'),
  getImagePath: (relPath) => ipcRenderer.invoke('get-image-path', relPath),
  getCurrentMap: () => ipcRenderer.invoke('get-current-map'),
  resizeWindow: (desiredHeight) => ipcRenderer.invoke('resize-window', desiredHeight),

  // Zoom view (bigger look at one image)
  openZoomView: (relImagePath) => ipcRenderer.invoke('open-zoom-view', relImagePath),

  // GSI setup
  onGsiSetupResult: (callback) => {
    ipcRenderer.on('gsi-setup-result', (_e, result) => callback(result));
  },
  setupGSIManually: () => ipcRenderer.invoke('setup-gsi-manual'),

  // Hotkey registration status (visible warning if F8/F9 couldn't be
  // claimed, e.g. another app is already using them)
  onHotkeyRegistrationFailed: (callback) => {
    ipcRenderer.on('hotkey-registration-failed', (_e, keys) => callback(keys));
  },

  // Analytics - one-time consent
  needsAnalyticsConsent: () => ipcRenderer.invoke('needs-analytics-consent'),
  recordAnalyticsConsent: (enabled) => ipcRenderer.invoke('record-analytics-consent', enabled),
  openPrivacyInfo: () => ipcRenderer.invoke('open-privacy-info'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  // Remote-controlled ad rotation
  getCachedAds: () => ipcRenderer.invoke('get-cached-ads'),
  onAdsUpdate: (callback) => {
    ipcRenderer.on('ads-update', (_event, ads) => callback(ads));
  },

  // Auto-update
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, status) => callback(status));
  },
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
});
