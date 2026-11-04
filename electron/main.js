// Cheetah Time — processus principal Electron.
// Démarre le serveur Next.js "standalone" embarqué sur un port local, puis
// affiche l'application dans une fenêtre. 100 % local : les données sont
// stockées dans le dossier utilisateur, aucune base ni réseau requis.
"use strict";

const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");
const { fork } = require("child_process");
const crypto = require("crypto");

let serverProc = null;
let mainWindow = null;
let serverPort = 0;
// Per-launch secret shared with the embedded server: only this window gets the
// cookie, so other local processes or browser tabs cannot use the local API.
const desktopToken = crypto.randomBytes(32).toString("base64url");
const DESKTOP_TOKEN_COOKIE = "cheetah_desktop_token";

// ── Sauvegarde locale : chemins (miroir de src/services/backup-store.ts) ──
function storeFilePath() {
  return path.join(app.getPath("userData"), "cheetah-time.local.json");
}
function backupsDirPath() {
  return path.join(app.getPath("userData"), "backups");
}
function backupConfigPath() {
  return path.join(app.getPath("userData"), "cheetah-backup-config.json");
}
function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Sauvegarde de secours SYNCHRONE à la fermeture / au plantage (le process
 * serveur peut déjà être mort). Ne sauve jamais un fichier corrompu. Recopie
 * aussi dans le dossier externe si configuré.
 */
function backupOnExit() {
  try {
    const src = storeFilePath();
    if (!fs.existsSync(src)) return;
    const raw = fs.readFileSync(src, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) return;
    } catch {
      return; // fichier corrompu : ne pas l'enregistrer comme snapshot
    }
    const dir = backupsDirPath();
    fs.mkdirSync(dir, { recursive: true });
    const name = `close-${stampNow()}-${Math.random().toString(16).slice(2, 8)}.json`;
    fs.writeFileSync(path.join(dir, name), raw, "utf8");
    try {
      if (fs.existsSync(backupConfigPath())) {
        const cfg = JSON.parse(fs.readFileSync(backupConfigPath(), "utf8"));
        if (cfg && cfg.externalFolder) {
          const ext = path.join(cfg.externalFolder, "CheetahTime-Sauvegardes");
          fs.mkdirSync(ext, { recursive: true });
          fs.writeFileSync(path.join(ext, name), raw, "utf8");
          fs.writeFileSync(path.join(ext, "cheetah-time-derniere-sauvegarde.json"), raw, "utf8");
        }
      }
    } catch {
      /* miroir externe best-effort */
    }
  } catch {
    /* la sauvegarde de secours ne doit jamais empêcher la fermeture */
  }
}

function registerBackupIpc() {
  ipcMain.handle("backup:choose-folder", async () => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "Choisir un dossier de sauvegarde (Drive, OneDrive, clé USB…)",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
    const folder = res.filePaths[0];
    try {
      fs.writeFileSync(backupConfigPath(), JSON.stringify({ externalFolder: folder }, null, 2), "utf8");
    } catch {
      /* la persistance côté serveur écrira aussi la config */
    }
    return folder;
  });
  ipcMain.handle("backup:reveal", async () => {
    const dir = backupsDirPath();
    try {
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
    } catch {
      /* ignore */
    }
    return true;
  });
}

const standaloneDir = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..", ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 40000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error("Le serveur Cheetah Time n'a pas répondu à temps."));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function startServer() {
  const port = await getFreePort();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    // Persistance 100 % locale, jamais la base distante.
    CHEETAH_TIME_PERSISTENCE: "local",
    DATABASE_URL: "",
    CHEETAH_TIME_LOCAL_STORE_PATH: path.join(app.getPath("userData"), "cheetah-time.local.json"),
    CHEETAH_DESKTOP_TOKEN: desktopToken,
  };
  serverProc = fork(serverEntry, [], {
    cwd: standaloneDir,
    env,
    execPath: process.execPath,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  if (serverProc.stdout) serverProc.stdout.on("data", (d) => console.log("[next]", d.toString().trimEnd()));
  if (serverProc.stderr) serverProc.stderr.on("data", (d) => console.error("[next]", d.toString().trimEnd()));
  serverProc.on("exit", (code) => {
    serverProc = null;
    if (code && code !== 0 && !app.isQuitting) {
      dialog.showErrorBox("Cheetah Time", "Le serveur interne s'est arrêté (code " + code + ").");
    }
  });
  await waitForServer(port);
  return port;
}

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font-family:Segoe UI,Arial,sans-serif;
    background:linear-gradient(135deg,#1a4a20 0%,#0e2714 55%,#0d1f10 100%);color:#fff;overflow:hidden}
  .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:18px}
  .logo{font-size:30px;font-weight:900;letter-spacing:-.02em}
  .logo span{color:#f4a321}
  .sub{font-size:12px;color:rgba(255,255,255,.55);letter-spacing:.18em;text-transform:uppercase}
  .bar{width:180px;height:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;position:relative}
  .bar i{position:absolute;left:-40%;width:40%;height:100%;border-radius:4px;
    background:linear-gradient(90deg,#56a45b,#f4a321);animation:run 1.1s infinite ease-in-out}
  @keyframes run{0%{left:-40%}100%{left:100%}}
</style></head><body><div class="wrap">
  <div class="logo">Cheetah<span>Time</span></div>
  <div class="sub">Démarrage en cours…</div>
  <div class="bar"><i></i></div>
</div></body></html>`)}`;

function isAppUrl(url) {
  return Boolean(serverPort) && url.startsWith(`http://127.0.0.1:${serverPort}/`);
}

// Only hand web and mail links to the OS: file:, smb:, custom protocol
// handlers etc. could launch local programs.
function isSafeExternalUrl(url) {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

async function loadApp() {
  if (!mainWindow || !serverPort) return;
  const appUrl = `http://127.0.0.1:${serverPort}/`;
  await mainWindow.webContents.session.cookies.set({
    url: appUrl,
    name: DESKTOP_TOKEN_COOKIE,
    value: desktopToken,
    httpOnly: true,
    sameSite: "strict",
  });
  await mainWindow.loadURL(appUrl);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0d1f10",
    title: "Cheetah Time",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.loadURL(SPLASH);
  // Ouvrir les liens externes dans le navigateur système.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Never let the app window navigate away from the embedded server.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("data:") || isAppUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

async function boot() {
  registerBackupIpc();
  createWindow();
  try {
    serverPort = await startServer();
    await loadApp();
  } catch (err) {
    dialog.showErrorBox("Cheetah Time", "Démarrage impossible :\n" + (err && err.message ? err.message : String(err)));
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      loadApp();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    backupOnExit(); // sauvegarde de secours à la fermeture (spec François)
  });
  app.on("quit", () => {
    if (serverProc) {
      try { serverProc.kill(); } catch { /* ignore */ }
    }
  });

  // Sauvegarde de secours si le rendu ou un process enfant plante.
  app.on("render-process-gone", () => backupOnExit());
  app.on("child-process-gone", () => backupOnExit());
  process.on("uncaughtException", (err) => {
    try { backupOnExit(); } catch { /* ignore */ }
    console.error("[cheetah] uncaughtException", err);
  });
}
