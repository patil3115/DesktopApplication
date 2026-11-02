# Secure Video Compressor

An offline-first, zero-telemetry, privacy-by-design desktop video compression utility for Windows.
If you want an application please visit Release

---

## Key Guarantees

1. **100% Offline & Local Processing:** Your video never leaves your machine. FFmpeg and FFprobe run strictly on-device.
2. **Zero Telemetry / Zero Cloud:** No analytics, no remote logging, no crash reporters, no tracking SDKs, no external APIs.
3. **Hardened Electron Sandbox:** Context isolation enabled, Node integration disabled, Chromium OS-level sandbox enforced, and strict Content Security Policy (`connect-src 'none'`) preventing any outbound network requests.
4. **Shell Injection Prevention:** No shell execution (`child_process.exec()` or `cmd.exe`). Binaries are spawned via direct argument arrays with `shell: false`.
5. **Path Traversal & UNC Abuse Protection:** Strict path canonicalization, rejection of UNC network paths (preventing NTLM hash harvesting), and rejection of operating system system root directories.
6. **Metadata Privacy Stripping:** By default, embedded GPS coordinates, device serial numbers, camera model details, and author timestamps are stripped (`-map_metadata -1`).
7. **Safe File Handling:** Safe default destination names (`<file>_compressed.mp4`) prevent accidental overwriting of master videos. Transcoding writes to an isolated application temp directory and moves to destination atomically.
8. **Automated Cleanup & Crash Recovery:** Temporary files use 128-bit cryptographically random names and are purged on completion, cancellation, or application startup.

---

## Architecture Overview

```text
React 19 Renderer (Sandboxed Chromium, No Node.js)
      │
      │ Minimal, Frozen IPC Bridge (contextBridge)
      ▼
Electron Preload Script
      │
      │ Validated IPC Channels
      ▼
Electron Main Process (Privileged Host Controller)
      ├── Schema Validation & Path Canonicalizer
      ├── Isolated Temp File Manager (%LOCALAPPDATA%\SecureVideoCompressor\temp)
      └── FFmpeg Child Process Supervisor (spawn with argument array, no shell)
            ├── ffprobe.exe (Safe metadata inspection)
            └── ffmpeg.exe (Local transcoding)
```

---

## Build & Development

### Prerequisites
- Windows 10/11 (x64)
- Node.js (v18+)
- npm (v9+)

### Installation & Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/patil3115/DesktopApplication.git
   cd DesktopApplication
   ```
   *(Or download and extract the ZIP from GitHub)*

2. **Install dependencies:**
   ```bash
   npm install
   ```
   > **Note:** During `npm install`, the automated `postinstall` hook runs `node scripts/setup-binaries.js` to automatically verify and download the official Gyan FFmpeg 9.0.2 essentials package and check SHA-256 hashes against `checksums.json`.

3. **Start the application in Development Mode:**
   ```bash
   npm run dev
   ```
   Launches the Vite server and Electron desktop window simultaneously with hot reload.

---

## Packaging a Portable Standalone Windows Application

To generate a completely self-contained, portable Windows release folder that anyone can double-click without needing Node.js or npm installed:

```bash
npm run package
```

The output will be created in:
```text
dist-package/SecureVideoCompressor-win32-x64/
  ├── SecureVideoCompressor.exe
  ├── resources/
  └── ...
```
You can zip the `dist-package/SecureVideoCompressor-win32-x64/` directory and distribute it directly to end users or publish it under **GitHub Releases**.

---

### Running Security & Integrity Audit Suite
```bash
npm run test:security
```
Executes 91 automated tests verifying:
- IPC schema enforcement
- Command injection resistance
- Path traversal & UNC share blocking
- Bundled FFmpeg SHA-256 cryptographic verification
- Live local video probing and transcoding on synthetic media
- Temporary file isolation and crash cleanup

---

## Bundled Binaries & Integrity

- **FFmpeg Version:** `9.0.2-essentials_build-www.gyan.dev`
- **Location:** `resources/bin/win32-x64/`
- **Manifest:** `resources/bin/win32-x64/checksums.json`
- **License:** GNU General Public License v3.0 (GPLv3)

See [PROVENANCE.md](resources/bin/win32-x64/PROVENANCE.md) for cryptographic SHA-256 hashes.

---

## Security Documentation

- [Architecture & Threat Model](docs/PHASE_1_ARCHITECTURE_AND_THREAT_MODEL.md)
- [Threat Model (STRIDE)](docs/THREAT_MODEL.md)
- [Privacy Policy](docs/PRIVACY.md)
- [Security Policy](SECURITY.md)
- [Security Audit Report](SECURITY_AUDIT.md)
