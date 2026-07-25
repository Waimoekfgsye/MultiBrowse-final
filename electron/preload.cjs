const { contextBridge, ipcRenderer } = require('electron');

// Every on* helper returns an unsubscribe function. The old one did not, so
// App.tsx's effect registered a fresh listener on every store change and
// never removed the old ones — they piled up, each holding a stale copy
// of the store, and the oldest (most stale) one ran first.
function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  auth: {
    setToken: (token) => ipcRenderer.invoke('auth-set-token', token),
    getToken: () => ipcRenderer.invoke('auth-get-token'),
    clearToken: () => ipcRenderer.invoke('auth-clear-token'),
  },

  browser: {
    checkInstalled: () => ipcRenderer.invoke('browser-check-installed'),
    launch: (profileId, config) => ipcRenderer.invoke('browser-launch', profileId, config),
    stop: (profileId) => ipcRenderer.invoke('browser-stop', profileId),
    stopAll: () => ipcRenderer.invoke('browser-stop-all'),
    listActive: () => ipcRenderer.invoke('browser-list-active'),
    isRunning: (profileId) => ipcRenderer.invoke('browser-is-running', profileId),
    download: () => ipcRenderer.invoke('browser-download'),

    onDownloadProgress: (callback) => subscribe('camoufox-download-progress', callback),
    onProfileStarted: (callback) => subscribe('browser-profile-started', callback),
    onProfileStopped: (callback) => subscribe('browser-profile-stopped', callback),
    // Fires on every reconcile with the full list of running profile IDs.
    // This is the one to trust — it is the main process reporting what the
    // OS actually shows, not what we believe we launched.
    onActiveChanged: (callback) => subscribe('browser-active-changed', callback),
  },

  quit: () => ipcRenderer.send('app-quit'),
});
