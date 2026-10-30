const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  enviar: (cmd) => ipcRenderer.send('cmd', cmd),
  onLog: (fn) => ipcRenderer.on('log', (_, dados) => fn(dados)),
  onLogsIniciais: (fn) => ipcRenderer.on('logs-iniciais', (_, logs) => fn(logs)),
  onStatus: (fn) => ipcRenderer.on('status', (_, status) => fn(status)),
});
