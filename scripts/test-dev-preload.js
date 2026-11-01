const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.resolve(__dirname, 'dev-test-output.log');
function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

fs.writeFileSync(logFile, '--- Starting Dev Mode Test ---\n');

app.whenReady().then(async () => {
  const preloadPath = path.resolve(__dirname, '../dist-electron/preload/index.js');
  log(`Preload path: ${preloadPath}`);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  win.webContents.on('preload-error', (event, p, error) => {
    log(`[Preload Error] in ${p}: ${error.stack || error.message || error}`);
  });

  win.webContents.on('console-message', (event) => {
    log(`[Renderer Console]: ${event.message}`);
  });

  const devUrl = 'http://localhost:5173';
  log(`Loading dev URL: ${devUrl}`);

  try {
    await win.loadURL(devUrl);
    log('Loaded URL successfully.');

    const hasApi = await win.webContents.executeJavaScript('Boolean(window.videoCompressor)');
    log(`Result on localhost:5173: window.videoCompressor exists? ${hasApi}`);

    const runtimeInfo = await win.webContents.executeJavaScript('window.videoCompressor ? window.videoCompressor.getRuntimeInfo() : null');
    log(`Runtime info from window.videoCompressor: ${JSON.stringify(runtimeInfo)}`);
  } catch (err) {
    log(`Failed to load dev URL: ${err.message}`);
  }

  app.quit();
});
