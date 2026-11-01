/**
 * Zero-Dependency Windows Packaging Script
 * 
 * Packages Secure Video Compressor into a self-contained portable Windows distribution:
 * - Uses the verified Electron binary already audited
 * - Integrates bundled ffmpeg.exe & ffprobe.exe in resources/bin/win32-x64/
 * - Includes compiled main, preload, and renderer assets
 * - Requires ZERO external vulnerable packaging dependencies (e.g., electron-builder)
 */

const fs = require('fs');
const path = require('path');

const { execFileSync } = require('child_process');
const { verifyExistingBinaries } = require('./setup-binaries');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-package', 'SecureVideoCompressor-win32-x64');
const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');

console.log('====================================================');
console.log('   PACKAGING SECURE VIDEO COMPRESSOR (PORTABLE)    ');
console.log('====================================================\n');

// 0. Ensure binaries exist
const binCheck = verifyExistingBinaries();
if (!binCheck.verified) {
  console.log('[Notice] Bundled FFmpeg binaries missing. Running setup...');
  execFileSync(process.execPath, [path.join(__dirname, 'setup-binaries.js')], {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

// 1. Ensure build outputs exist
const distElectron = path.join(rootDir, 'dist-electron');
const distRenderer = path.join(rootDir, 'dist-renderer');

if (!fs.existsSync(distElectron) || !fs.existsSync(distRenderer)) {
  console.error('Error: dist-electron or dist-renderer does not exist. Run "npm run build" first.');
  process.exit(1);
}

// 2. Prepare destination directory
if (fs.existsSync(outDir)) {
  console.log('Cleaning previous package output...');
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 3. Copy Electron distribution
console.log('Copying hardened Electron runtime...');
fs.cpSync(electronDistDir, outDir, { recursive: true });

// 4. Rename executable
const oldExe = path.join(outDir, 'electron.exe');
const newExe = path.join(outDir, 'SecureVideoCompressor.exe');
if (fs.existsSync(oldExe)) {
  fs.renameSync(oldExe, newExe);
  console.log('Renamed binary to SecureVideoCompressor.exe');
}

// 5. Stage application resources into resources/app
const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

console.log('Staging compiled application modules...');
fs.cpSync(distElectron, path.join(appDir, 'dist-electron'), { recursive: true });
fs.cpSync(distRenderer, path.join(appDir, 'dist-renderer'), { recursive: true });

// Minimal runtime package.json
const runtimePkg = {
  name: "secure-video-compressor",
  version: "1.0.0",
  main: "dist-electron/main/index.js",
  private: true
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));

// 6. Copy bundled FFmpeg & FFprobe binaries
console.log('Bundling verified FFmpeg & FFprobe binaries...');
const srcBin = path.join(rootDir, 'resources', 'bin', 'win32-x64');
const destBin = path.join(outDir, 'resources', 'bin', 'win32-x64');
fs.mkdirSync(destBin, { recursive: true });
fs.cpSync(srcBin, destBin, { recursive: true });

console.log('\nPackaging complete!');
console.log(`Executable located at: ${newExe}`);
console.log('====================================================\n');
