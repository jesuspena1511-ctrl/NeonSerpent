const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { startServer, stopServer } = require('./server');

// Mantiene la misma carpeta de datos que la versión anterior del .exe.
// Así el guardado existente (file://) sigue disponible.
app.setName('neon-serpent');
app.setPath('userData', path.join(app.getPath('appData'), 'neon-serpent'));

let mainWindow = null;
let localServer = null;
let onlineApi = '';
let quitting = false;

function normalizeApi(value) {
  if (!value) return '';
  const out = String(value).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(out) ? out : '';
}

function readOnlineConfig() {
  const candidates = [];
  if (process.env.NEON_ONLINE_CONFIG) candidates.push(process.env.NEON_ONLINE_CONFIG);
  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), 'online-config.json'));
    candidates.push(path.join(process.resourcesPath, 'online-config.json'));
  }
  candidates.push(path.join(__dirname, 'online-config.json'));
  candidates.push(path.join(process.cwd(), 'online-config.json'));
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { file, data: data || {} };
    } catch (e) {
      // Config inválida: se ignora y se usa el servidor local.
    }
  }
  return null;
}

function readOnlineApi() {
  const fromEnv = normalizeApi(process.env.NEON_ONLINE_API);
  if (fromEnv) return fromEnv;
  const config = readOnlineConfig();
  return config ? normalizeApi(config.data.api) : '';
}

function probeNeonServer(base) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const req = http.get(base + '/health', { timeout: 1200 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 4096) body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) return finish(false);
        try {
          const data = JSON.parse(body);
          finish(!!(data && data.ok === true && data.version));
        } catch (e) {
          finish(false);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.on('error', () => finish(false));
  });
}

async function ensureLocalServer() {
  const preferred = Number(process.env.NEON_LOCAL_PORT || 3000);
  const base = 'http://127.0.0.1:' + preferred;
  if (await probeNeonServer(base)) {
    return { url: base, owned: false };
  }
  try {
    const result = await startServer({ port: preferred, host: '0.0.0.0' });
    localServer = result.server;
    return { url: 'http://127.0.0.1:' + result.port, owned: true };
  } catch (err) {
    if (err && err.code !== 'EADDRINUSE') throw err;
    // El puerto está ocupado por otra aplicación: usa uno libre.
    const result = await startServer({ port: 0, host: '0.0.0.0' });
    localServer = result.server;
    return { url: 'http://127.0.0.1:' + result.port, owned: true };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#05070d',
    autoHideMenuBar: true,
    title: 'Neon Serpent',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  const loadOptions = onlineApi ? { query: { online: onlineApi } } : undefined;
  mainWindow.loadFile(path.join(__dirname, 'index.html'), loadOptions);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    onlineApi = readOnlineApi();
    if (!onlineApi) {
      const local = await ensureLocalServer();
      onlineApi = local.url;
    }
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Neon Serpent',
      'No se pudo iniciar el servidor online local.\n\n' + (err && err.message ? err.message : err)
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', (e) => {
  if (!localServer || quitting) return;
  e.preventDefault();
  quitting = true;
  stopServer().finally(() => {
    localServer = null;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
