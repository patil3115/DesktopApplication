/**
 * Unified Development Launcher
 * 
 * Flow:
 * 1. Compiles Electron main & preload scripts (tsc)
 * 2. Spawns Vite development server using node directly
 * 3. Polls http://localhost:5173 until ready
 * 4. Launches Electron hosting the React app via BrowserWindow
 * 5. Cleans up Vite process when Electron window closes
 */

const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('   STARTING SECURE VIDEO COMPRESSOR (DEV MODE)     ');
console.log('====================================================\n');

// 0. Ensure bundled binaries exist and are verified
const { verifyExistingBinaries } = require('./setup-binaries');
const binCheck = verifyExistingBinaries();
if (!binCheck.verified) {
  console.log('[Notice] Bundled FFmpeg binaries missing or unverified. Running setup...');
  execFileSync(process.execPath, [path.join(__dirname, 'setup-binaries.js')], {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

// 1. Compile Electron main and preload TypeScript using tsc directly
console.log('[1/3] Compiling Electron main and preload scripts...');
const tscPath = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.electron.json'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
} catch (err) {
  console.error('Failed to compile Electron TypeScript:', err.message);
  process.exit(1);
}

// 2. Start Vite server using node directly (cross-platform, avoids Windows spawn EINVAL)
console.log('[2/3] Starting Vite development server on port 5173...');
const vitePath = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const viteProcess = spawn(process.execPath, [vitePath], {
  cwd: rootDir,
  stdio: 'pipe'
});

viteProcess.stdout.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('Local:')) {
    console.log('[Vite dev server listening on port 5173]');
  }
});

viteProcess.stderr.on('data', (data) => {
  console.error('[Vite error]', data.toString());
});

// 3. Wait for Vite server readiness
function waitForVite(callback, maxAttempts = 30) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const req = http.get('http://localhost:5173', (res) => {
      if (res.statusCode && res.statusCode < 500) {
        clearInterval(interval);
        callback();
      }
    });

    req.on('error', () => {
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.error('Timeout waiting for Vite dev server.');
        try {
          viteProcess.kill();
        } catch {
          // Ignore
        }
        process.exit(1);
      }
    });

    req.end();
  }, 200);
}

waitForVite(() => {
  console.log('[3/3] Vite is ready. Launching Electron desktop window...\n');

  const electronCliPath = path.join(rootDir, 'node_modules', 'electron', 'cli.js');
  const electronProcess = spawn(
    process.execPath,
    [electronCliPath, 'dist-electron/main/index.js'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: 'http://localhost:5173'
      }
    }
  );

  electronProcess.on('close', (code) => {
    console.log(`\nElectron closed (exit code ${code}). Stopping Vite...`);
    try {
      if (process.platform === 'win32') {
        spawn('taskkill.exe', ['/PID', viteProcess.pid.toString(), '/T', '/F']);
      } else {
        viteProcess.kill('SIGTERM');
      }
    } catch {
      // Ignore
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  try {
    viteProcess.kill();
  } catch {
    // Ignore
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  try {
    viteProcess.kill();
  } catch {
    // Ignore
  }
  process.exit(0);
});
