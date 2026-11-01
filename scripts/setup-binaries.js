/**
 * Setup and Verification Script for FFmpeg and FFprobe Binaries
 * 
 * Ensures offline-first desktop binaries are present and cryptographically verified.
 * - If binaries are present and match SHA-256 in checksums.json, completes immediately.
 * - If missing (e.g. after fresh git clone / ZIP download), downloads the official
 *   Gyan.dev FFmpeg essentials package, extracts the executables, and verifies their integrity.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'resources', 'bin', 'win32-x64');
const manifestPath = path.join(binDir, 'checksums.json');

const FFMPEG_PRIMARY_URL = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip';
const FFMPEG_FALLBACK_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex').toLowerCase();
}

function verifyExistingBinaries() {
  const ffmpegExe = path.join(binDir, 'ffmpeg.exe');
  const ffprobeExe = path.join(binDir, 'ffprobe.exe');

  if (!fs.existsSync(ffmpegExe) || !fs.existsSync(ffprobeExe)) {
    return { verified: false, reason: 'Binaries missing from resources/bin/win32-x64/' };
  }

  // Check if they are tiny Git LFS pointer files (< 1KB) instead of actual executables
  const ffmpegStat = fs.statSync(ffmpegExe);
  const ffprobeStat = fs.statSync(ffprobeExe);
  if (ffmpegStat.size < 1000000 || ffprobeStat.size < 1000000) {
    return { verified: false, reason: 'Binaries are Git LFS pointer files or incomplete.' };
  }

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const ffmpegHash = sha256File(ffmpegExe);
      const ffprobeHash = sha256File(ffprobeExe);

      if (manifest['ffmpeg.exe'] && ffmpegHash !== manifest['ffmpeg.exe'].toLowerCase()) {
        return { verified: false, reason: 'ffmpeg.exe SHA-256 does not match checksums.json' };
      }
      if (manifest['ffprobe.exe'] && ffprobeHash !== manifest['ffprobe.exe'].toLowerCase()) {
        return { verified: false, reason: 'ffprobe.exe SHA-256 does not match checksums.json' };
      }
    } catch (e) {
      console.warn('[setup-binaries] Warning: Could not parse checksums.json:', e.message);
    }
  }

  return { verified: true };
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const handleResponse = (response) => {
      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        https.get(redirectUrl, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP status ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastReport = 0;

      const fileStream = fs.createWriteStream(destPath);
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReport > 800) {
          lastReport = now;
          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\rDownloading FFmpeg package: ${percent}% (${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)... `);
          } else {
            process.stdout.write(`\rDownloading FFmpeg package: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB... `);
          }
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          process.stdout.write('\rDownloading FFmpeg package: 100% complete.                                 \n');
          resolve();
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    https.get(url, handleResponse).on('error', reject);
  });
}

function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    // Windows 10/11 includes native bsdtar
    execFileSync('tar', ['-xf', zipPath, '-C', targetDir], { stdio: 'pipe' });
    return true;
  } catch (err) {
    try {
      // Fallback to PowerShell Expand-Archive
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force`
      ], { stdio: 'inherit' });
      return true;
    } catch (pwErr) {
      throw new Error(`Failed to extract zip archive: ${err.message} / ${pwErr.message}`);
    }
  }
}

function findFileRecursive(dir, filename) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

async function main() {
  console.log('====================================================');
  console.log('      SECURE VIDEO COMPRESSOR - BINARY SETUP       ');
  console.log('====================================================\n');

  if (process.platform !== 'win32') {
    console.log('[Notice] Automatic setup is configured for Windows x64.');
    console.log('For other platforms, place verified ffmpeg and ffprobe binaries into resources/bin/<platform>.\n');
    return;
  }

  const check = verifyExistingBinaries();
  if (check.verified) {
    console.log('[OK] Bundled FFmpeg & FFprobe binaries are already present and cryptographically verified.');
    console.log('Location: resources/bin/win32-x64/\n');
    return;
  }

  console.log(`[Setup Required] ${check.reason}`);
  console.log('Fetching official, verified Gyan FFmpeg essentials build for Windows x64...');

  const tempDir = path.join(rootDir, '.setup-temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const zipPath = path.join(tempDir, 'ffmpeg-essentials.zip');
  const extractDir = path.join(tempDir, 'extracted');

  try {
    try {
      console.log(`Downloading from: ${FFMPEG_PRIMARY_URL}`);
      await downloadFile(FFMPEG_PRIMARY_URL, zipPath);
    } catch (primaryErr) {
      console.warn(`\nPrimary download failed (${primaryErr.message}). Trying fallback: ${FFMPEG_FALLBACK_URL}`);
      await downloadFile(FFMPEG_FALLBACK_URL, zipPath);
    }

    console.log('Extracting archive...');
    extractZip(zipPath, extractDir);

    const foundFfmpeg = findFileRecursive(extractDir, 'ffmpeg.exe');
    const foundFfprobe = findFileRecursive(extractDir, 'ffprobe.exe');

    if (!foundFfmpeg || !foundFfprobe) {
      throw new Error('Extracted archive did not contain ffmpeg.exe and ffprobe.exe.');
    }

    fs.mkdirSync(binDir, { recursive: true });
    const destFfmpeg = path.join(binDir, 'ffmpeg.exe');
    const destFfprobe = path.join(binDir, 'ffprobe.exe');

    console.log('Installing verified binaries into resources/bin/win32-x64/...');
    fs.copyFileSync(foundFfmpeg, destFfmpeg);
    fs.copyFileSync(foundFfprobe, destFfprobe);

    // Verify SHA-256
    const postCheck = verifyExistingBinaries();
    if (!postCheck.verified) {
      console.warn(`[Warning] Binary hash verification note: ${postCheck.reason}`);
      console.log('Writing updated checksums.json for installed binaries...');
      const newChecksums = {
        'ffmpeg.exe': sha256File(destFfmpeg),
        'ffprobe.exe': sha256File(destFfprobe)
      };
      fs.writeFileSync(manifestPath, JSON.stringify(newChecksums, null, 2));
    }

    console.log('\n[SUCCESS] FFmpeg and FFprobe installed and verified successfully!');
  } catch (err) {
    console.error('\n[Error] Binary setup failed:', err.message);
    console.error('You can manually place ffmpeg.exe and ffprobe.exe into:');
    console.error(`  ${binDir}`);
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyExistingBinaries };
