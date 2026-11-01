const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { registerIpcHandlers } = require('../dist-electron/main/ipc-handlers');
const { binaryResolver } = require('../dist-electron/main/ffmpeg/binary-resolver');

const logFile = path.resolve(__dirname, 'ipc-test.log');
function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

fs.writeFileSync(logFile, '--- Starting Comprehensive IPC Bridge Test ---\n');

app.whenReady().then(async () => {
  // Generate small test video if needed
  const testSamplePath = path.resolve(__dirname, 'sample_verify.mp4');
  const ffmpegPath = binaryResolver.getFfmpegPath();

  await new Promise((resolve) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
      '-c:v', 'libx264', '-c:a', 'aac',
      testSamplePath
    ], { shell: false });
    gen.on('close', resolve);
  });

  const preloadPath = path.resolve(__dirname, '../dist-electron/preload/index.js');
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  registerIpcHandlers(win);

  // Test 1: Dialog Cancellation
  const originalShowOpenDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => {
    log('Test 1: User cancels dialog');
    return { canceled: true, filePaths: [] };
  };

  const rendererPath = path.resolve(__dirname, '../dist-renderer/index.html');
  await win.loadFile(rendererPath);

  const cancelResult = await win.webContents.executeJavaScript('window.videoCompressor.selectVideo()');
  log(`Test 1 Result: ${JSON.stringify(cancelResult)}`);

  // Test 2: User selects valid video
  dialog.showOpenDialog = async () => {
    log('Test 2: User selects valid video file');
    return { canceled: false, filePaths: [testSamplePath] };
  };

  const fileResult = await win.webContents.executeJavaScript('window.videoCompressor.selectVideo()');
  log(`Test 2 Result (probed video): canceled=${fileResult.canceled}, fileName=${fileResult.metadata ? fileResult.metadata.fileName : 'none'}, resolution=${fileResult.metadata ? fileResult.metadata.resolutionLabel : 'none'}`);

  // Test 3: Verify Renderer has NO Node or filesystem access
  const hasRequire = await win.webContents.executeJavaScript('typeof require');
  const hasProcess = await win.webContents.executeJavaScript('typeof process');
  const hasFs = await win.webContents.executeJavaScript('typeof fs');
  const hasIpcRenderer = await win.webContents.executeJavaScript('typeof ipcRenderer');
  log(`Security check: require=${hasRequire}, process=${hasProcess}, fs=${hasFs}, ipcRenderer=${hasIpcRenderer}`);

  // Restore and cleanup
  dialog.showOpenDialog = originalShowOpenDialog;
  try {
    fs.unlinkSync(testSamplePath);
  } catch {}

  app.quit();
});
