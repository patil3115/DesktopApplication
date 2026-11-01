const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.resolve(__dirname, 'test-output.log');
function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

fs.writeFileSync(logFile, '--- Starting Test ---\n');

app.whenReady().then(async () => {
  const preloadPath = path.resolve(__dirname, '../dist-electron/preload/index.js');
  log(`Testing preload path: ${preloadPath}`);
  log(`Preload file exists: ${fs.existsSync(preloadPath)}`);

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

  const rendererPath = path.resolve(__dirname, '../dist-renderer/index.html');
  log(`Renderer path: ${rendererPath}`);
  await win.loadFile(rendererPath);

  const hasApi = await win.webContents.executeJavaScript('Boolean(window.videoCompressor)');
  log(`Result: window.videoCompressor exists? ${hasApi}`);

  const apiKeys = await win.webContents.executeJavaScript('window.videoCompressor ? Object.keys(window.videoCompressor) : null');
  log(`API keys on window.videoCompressor: ${JSON.stringify(apiKeys)}`);

  const bodyHtml = await win.webContents.executeJavaScript('document.body.innerHTML');
  log(`Body HTML snippet: ${bodyHtml.slice(0, 300)}`);

  app.quit();
});
