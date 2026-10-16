const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  settings: () => ipcRenderer.invoke("settings"),
  openFiles: () => ipcRenderer.invoke("open-files"),
  readFile: p => ipcRenderer.invoke("read-file", p),
  fit: (w, h) => ipcRenderer.send("fit", w, h),
  passThrough: on => ipcRenderer.send("pass-through", on),
  setMode: m => ipcRenderer.send("mode-set", m),
  setVolume: v => ipcRenderer.send("volume-set", v),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("drag-move", dx, dy),
  menu: () => ipcRenderer.send("menu"),
  themeLive: hex => ipcRenderer.send("theme-live", hex),
  on: (ch, fn) => ipcRenderer.on(ch, (_, ...a) => fn(...a))
});
