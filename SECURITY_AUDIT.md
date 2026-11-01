# Security & Privacy Audit Report: Secure Video Compressor

**Application:** Secure Video Compressor  
**Target Environment:** Windows 10/11 Desktop  
**Audit Date:** November 2026  
**Auditor Classification:** Principal Desktop Security Architect & Privacy Engineer  
**Status:** Audit Passed (38/38 Automated Verification Tests Successful)  

---

## 1. Architecture Overview
Secure Video Compressor adopts a multi-process architecture based on Chromium and Node.js (Electron), separating presentation, coordination, and media computation into discrete privilege tiers:
- **Renderer Process:** Unprivileged Chromium sandbox displaying the React UI. Contains no Node.js APIs and cannot interact with the operating system or network.
- **Preload Script:** Immutable bridge using Electron's `contextBridge` to expose a minimal, strictly typed API object (`window.videoCompressor`).
- **Main Process:** Privileged Node.js coordinator handling native file dialogs, IPC payload validation, path canonicalization, disk space checks, and process supervision.
- **Worker Subprocesses:** Direct, non-shell execution of bundled `ffprobe.exe` and `ffmpeg.exe` with discrete argument arrays.

---

## 2. Trust Boundaries
Four clear trust boundaries govern data flow across the application:
1. **Renderer <-> Preload Boundary:** Crossing from untrusted Chromium web environment to preload script. Enforced by `contextIsolation: true` and frozen API methods.
2. **Preload <-> Main Process IPC Boundary:** Crossing from preload bridge to privileged Node.js controller. Treated as an untrusted boundary where all inputs undergo strict schema and type validation.
3. **Main Process <-> Filesystem Boundary:** Only explicit user-selected files and the dedicated isolated application temp directory are accessed. Canonicalization prevents traversal; UNC shares and OS system roots are denied.
4. **Main Process <-> FFmpeg Subprocess Boundary:** Command arguments are constructed programmatically from internal enums. No user strings are passed to shell interpreters.

---

## 3. Attack Surface Analysis
- **User Interface Input Surface:** Form dropdowns and checkboxes. Strictly constrained to fixed enums.
- **File Ingestion Surface:** Drag-and-drop or Browse dialog. Files are inspected via read-only FFprobe before any transcode is permitted.
- **Subprocess Surface:** Subprocess standard input is closed (`-nostdin`), standard output and error are piped through bounded buffers.
- **Network Surface:** Attack surface is zero. CSP enforces `connect-src 'none'`. Outbound network libraries are absent.

---

## 4. Threat Model Summary (STRIDE & T1–T9)
Detailed threat analysis was conducted in `docs/THREAT_MODEL.md`:
- **T1 (Malicious Video):** Mitigated via unprivileged subprocess execution, input probing, and bounded timeouts.
- **T2 (Command Injection):** Mitigated by complete avoidance of `child_process.exec()` or shell interpreters. Spawns use explicit argument arrays with `shell: false`.
- **T3 (Path Traversal / UNC Abuse):** Mitigated via `path.resolve()`, `fs.realpathSync()`, and explicit rejection of `\\` and `//` UNC prefixes.
- **T4 (Renderer Compromise):** Mitigated via `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and strict CSP.
- **T5 (Dependency Poisoning):** Mitigated via zero-telemetry policy, clean `npm audit` (0 vulnerabilities), and minimal dependency tree.
- **T6 (Metadata Privacy Leak):** Mitigated by default stripping of metadata tags (`-map_metadata -1`) and privacy-redacted diagnostic logging.
- **T7 (Insecure Temp Files):** Mitigated by dedicated storage in `%LOCALAPPDATA%\SecureVideoCompressor\temp` with 128-bit random file naming and deterministic cleanup.
- **T8 (Resource Exhaustion):** Mitigated by single-concurrency enforcement and pre-flight disk space verification (1.2x safety multiplier).
- **T9 (Accidental Overwrite):** Mitigated by collision-safe naming (`_compressed.mp4`) and staged atomic moving.

---

## 5. IPC Security Implementation
- Explicit channel allowlist: `IPC_CHANNELS` in `src/common/ipc-channels.ts`.
- Generic commands (`exec`, `run`, `readFile`) are strictly prohibited and do not exist.
- Schema validator (`src/common/validators.ts`) validates:
  - String types and length limits (<= 4096 characters).
  - Absence of null bytes (`\0`).
  - Absence of UNC path prefixes (`\\` and `//`).
  - Exact membership in preset sets for Quality, Resolution, Video Codec, and Audio Codec.
  - Boolean types for metadata toggle.
- Errors returned to the renderer use safe structured DTOs (`StructuredError`) that do not leak raw stack traces or internal filesystem structures.

---

## 6. Filesystem Security
- Traversal protection: paths are canonicalized and tested against drive roots.
- Protected Windows directories (`%WINDIR%`, `%PROGRAMFILES%`, `%SYSTEMROOT%`) are blacklisted from input/output.
- File existence and regular file checks (`stats.isFile()`) ensure directories, devices, or symbolic links cannot be passed as video inputs.
- Safe atomic moves: intermediate transcoding occurs in the private temp directory and is moved atomically upon verified success.

---

## 7. FFmpeg Execution Security
- Binaries are bundled directly in `resources/bin/win32-x64/` and verified against `checksums.json` using SHA-256 before invocation.
- Child process spawning uses:
  ```typescript
  spawn(ffmpegPath, args, {
    shell: false,
    windowsHide: true,
    env: { SYSTEMROOT: process.env.SYSTEMROOT, PATH: '' }
  })
  ```
- Subprocess environment strips `PATH` to eliminate search-order and DLL planting risks.
- Process lifecycle supervisor tracks PID and performs clean tree termination (`taskkill.exe /PID <pid> /T /F`) upon cancellation.

---

## 8. Dependency Security
- Zero unnecessary dependencies. Only Electron, React, React-DOM, TypeScript, Vite, and Lucide SVG icons are utilized.
- `npm audit` report: **0 vulnerabilities** across all runtime and build dependencies.
- Zero analytics, telemetry, or remote crash reporting SDKs.

---

## 9. Network Security & Air-Gap Enforcement
- Content Security Policy (CSP):
  ```http
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'; object-src 'none';
  ```
- `connect-src 'none'` forbids any `fetch()`, `XMLHttpRequest`, or `WebSocket` connections.
- Navigation prevention: `will-navigate` is canceled; `setWindowOpenHandler` denies all external window/popup requests.
- Device permissions: camera, microphone, geolocation, and notification permissions are unconditionally denied by `session.defaultSession.setPermissionRequestHandler`.

---

## 10. Privacy Analysis
- **Video Privacy:** Zero bytes of user video or extracted audio are uploaded, cached remotely, or logged.
- **Metadata Stripping:** Strips EXIF tags, GPS latitude/longitude, camera model numbers, and creation timestamps by default.
- **Diagnostic Logging:** Logs redact user home paths and usernames (e.g. `C:\Users\<USER>\Videos\<FILE>`).

---

## 11. Temporary File Handling & Crash Recovery
- Stored exclusively in `%LOCALAPPDATA%\SecureVideoCompressor\temp\`.
- Named via `crypto.randomBytes(16).toString('hex')`.
- Cleaned immediately on job completion, cancellation, or fatal transcode error.
- Startup crash recovery: `cleanOrphanedCrashFiles()` scrubs leftover `svc_*.mp4` files from any prior aborted session upon application launch.

---

## 12. Security Verification & Test Results

The automated security test suite (`scripts/security-audit.js`) executed **38 tests**:
- **IPC & Path Validation:** 9 tests (all passed)
- **Settings Schema & Injection:** 7 tests (all passed)
- **FFmpeg Binary Integrity:** 5 tests (all passed, SHA-256 verified)
- **Progress Parser:** 4 tests (all passed)
- **Temp Storage Isolation & Cleanup:** 4 tests (all passed)
- **Live Local Transcoding & Probing:** 9 tests (all passed on synthetic media)

**Test Result Summary: 38 PASSED, 0 FAILED.**

---

## 13. Known Limitations & Practical Constraints
1. **Local Host Compromise:** If an attacker already possesses administrative/kernel-level control or malware running with the same user privileges on the host machine, they could inspect memory or read files directly from the user's filesystem.
2. **Zero-Day Codec Vulnerabilities:** Although FFmpeg runs in an unprivileged child process with minimal environment and arguments array execution, severe unpatched vulnerabilities in deep video demuxing algorithms remain an inherent risk of multimedia processing.
3. **Single Concurrency:** To ensure system stability and prevent resource exhaustion, only one compression job may execute simultaneously.

---

## 14. Remaining Risks & Ongoing Defensive Posture
- Regular updating of bundled FFmpeg binaries when security patches are released upstream.
- Periodic verification of Electron and Chromium CVE advisories.
- Continued adherence to the principle of least privilege.
