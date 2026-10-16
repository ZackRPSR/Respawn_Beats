const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const THEMES = ["Original", "Dusk", "Mint", "Ember"];
const cfgFile = () => path.join(app.getPath("userData"), "settings.json");
let cfg = { alwaysOnTop: false, palette: "Original", customColor: "#6d5bd0", mode: "widget", volume: 0.8 };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) }; } catch {}
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch {} };

if (!app.requestSingleInstanceLock()) app.quit();

let win, picker, dragStart, posTimer;
const preload = path.join(__dirname, "preload.js");
const ICON = path.join(__dirname, "assets", "icon.ico");

function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 430, x: cfg.x, y: cfg.y,
    icon: ICON, frame: false, transparent: true, backgroundColor: "#00000000",
    resizable: false, hasShadow: false, alwaysOnTop: cfg.alwaysOnTop,
    webPreferences: { preload, contextIsolation: true }
  });
  win.loadFile("index.html", { query: { mode: cfg.mode } });
  win.on("move", () => {
    clearTimeout(posTimer);
    posTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      [cfg.x, cfg.y] = win.getPosition();
      save();
    }, 400);
  });
}

function openPicker() {
  if (picker && !picker.isDestroyed()) return picker.focus();
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  let x = b.x + b.width + 8;
  if (x + 300 > wa.x + wa.width) x = b.x - 308;
  picker = new BrowserWindow({
    width: 280, height: 400, useContentSize: true, x: Math.max(wa.x, x), y: Math.max(wa.y, b.y),
    parent: win, icon: ICON, title: "Custom theme", resizable: false, minimizable: false, maximizable: false,
    autoHideMenuBar: true, backgroundColor: "#1c1c20",
    webPreferences: { preload, contextIsolation: true }
  });
  picker.setMenu(null);
  picker.loadFile("picker.html");
  picker.on("closed", () => { picker = null; save(); });
}

ipcMain.handle("settings", () => cfg);
ipcMain.handle("open-files", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac"] }]
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("read-file", (_, p) => fs.promises.readFile(p));
ipcMain.on("fit", (_, w, h) => win && win.setContentSize(w, h));
ipcMain.on("pass-through", (_, on) => win && win.setIgnoreMouseEvents(!!on, { forward: true }));
ipcMain.on("volume-set", (_, v) => { if (typeof v === "number" && v >= 0 && v <= 1) { cfg.volume = v; save(); } });
ipcMain.on("mode-set", (_, mode) => { cfg.mode = mode === "deco" ? "deco" : "widget"; save(); });
ipcMain.on("drag-start", () => { dragStart = win.getPosition(); });
ipcMain.on("drag-move", (_, dx, dy) => {
  if (dragStart) win.setPosition(Math.round(dragStart[0] + dx), Math.round(dragStart[1] + dy));
});
ipcMain.on("theme-live", (_, hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  cfg.palette = "Custom";
  cfg.customColor = hex;
  win.webContents.send("palette", "Custom", hex, true);
});
ipcMain.on("menu", () => {
  Menu.buildFromTemplate([
    { label: cfg.mode === "deco" ? "Widget mode" : "Decoration mode", click: () => win.webContents.send("toggle-mode") },
    { label: "Play / Pause", click: () => win.webContents.send("toggle") },
    { label: "Add songs…", click: () => win.webContents.send("add") },
    { type: "separator" },
    { label: "Theme", submenu: [
        ...THEMES.map(n => ({
          label: n, type: "radio", checked: cfg.palette === n,
          click: () => { cfg.palette = n; save(); win.webContents.send("palette", n); } })),
        { type: "separator" },
        { label: "Custom…", type: "radio", checked: cfg.palette === "Custom", click: openPicker }
    ] },
    { label: "Always on top", type: "checkbox", checked: cfg.alwaysOnTop,
      click: m => { cfg.alwaysOnTop = m.checked; win.setAlwaysOnTop(m.checked); save(); } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]).popup({ window: win });
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
