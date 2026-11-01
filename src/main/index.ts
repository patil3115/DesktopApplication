import { app, BrowserWindow } from 'electron';
import path from 'path';
import { applySecurityPolicies } from './security';
import { registerIpcHandlers } from './ipc-handlers';
import { tempManager } from './fs/temp-manager';
import { binaryResolver } from './ffmpeg/binary-resolver';
import { jobSupervisor } from './ffmpeg/compressor';
import { audioExtractorSupervisor } from './ffmpeg/audio-extractor';
import { logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<BrowserWindow> {
  const isDev = !app.isPackaged && (process.env['NODE_ENV'] === 'development' || Boolean(process.env['VITE_DEV_SERVER_URL']));
  const preloadPath = path.resolve(__dirname, '../preload/index.js');

  logger.info('Initializing BrowserWindow with secure defaults. Preload path:', preloadPath);

  const win = new BrowserWindow({
    width: 1040,
    height: 780,
    minWidth: 880,
    minHeight: 640,
    title: 'Secure Video Compressor',
    backgroundColor: '#0c0e14',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      preload: preloadPath,
      devTools: isDev
    }
  });

  applySecurityPolicies(win);
  registerIpcHandlers(win);

  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = process.env['VITE_DEV_SERVER_URL'] || (isDev ? 'http://localhost:5173' : null);

  if (devUrl) {
    logger.info('Development mode detected. Connecting to Vite dev server at', devUrl);
    try {
      await win.loadURL(devUrl);
    } catch (err) {
      logger.warn('Failed to load dev server URL, falling back to local bundle', err);
      const rendererPath = path.resolve(__dirname, '../../dist-renderer/index.html');
      await win.loadFile(rendererPath);
    }
  } else {
    const rendererPath = path.resolve(__dirname, '../../dist-renderer/index.html');
    logger.info('Loading packaged local renderer from', rendererPath);
    await win.loadFile(rendererPath);
  }

  return win;
}

// Enforce single application instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    logger.info('Secure Video Compressor starting up in secure offline mode.');

    // 1. Startup crash recovery: purge stale temp files
    tempManager.cleanOrphanedCrashFiles();

    // 2. Verify bundled binaries
    try {
      binaryResolver.verifyBinaries();
    } catch (err) {
      logger.error('Binary verification warning during startup', err);
    }

    mainWindow = await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = await createWindow();
      }
    });
  });

  // Safe shutdown lifecycle
  app.on('before-quit', async (event) => {
    logger.info('Application shutting down. Terminating active tasks and scrubbing temporary files.');
    if (jobSupervisor.isRunning() || audioExtractorSupervisor.isRunning()) {
      event.preventDefault();
      await jobSupervisor.cancel();
      await audioExtractorSupervisor.cancel();
      await tempManager.cleanupAllActive();
      app.exit(0);
    } else {
      await tempManager.cleanupAllActive();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
