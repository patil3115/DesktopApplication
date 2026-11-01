# Security Policy: Secure Video Compressor

## Reporting Security Issues

We take the security and privacy of this desktop application seriously. If you discover a security vulnerability, please report it via private disclosure rather than opening a public issue.

---

## Security Model & Controls

### 1. Chromium Sandbox & Electron Isolation
- `contextIsolation: true` is strictly enforced to prevent prototype pollution attacks between web contexts and the preload script.
- `nodeIntegration: false` ensures the Renderer has no direct access to Node.js APIs (`fs`, `child_process`, `net`, `http`, etc.).
- `sandbox: true` confines the rendering engine to the OS-level Chromium sandbox.
- Content Security Policy (CSP):
  ```text
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'; object-src 'none';
  ```
  `connect-src 'none'` enforces an air-gap at the browser network layer, preventing outbound HTTP requests, WebSockets, or background beaconing.

### 2. IPC Allowlisting & Defense-in-Depth
- IPC endpoints are strictly allowlisted by exact channel names in `src/common/ipc-channels.ts`.
- Every incoming IPC request is validated through schemas in `src/common/validators.ts`:
  - Path strings are inspected for null bytes (`\0`), traversal sequences, and UNC prefixes.
  - User options are checked against strict enums (`QualityPreset`, `ResolutionOption`, `VideoCodecOption`, `AudioCodecOption`).
  - No dynamic commands, free-form FFmpeg flags, or shell strings can be passed from the Renderer.

### 3. Subprocess Execution & No Shell
- FFmpeg and FFprobe are executed exclusively via `child_process.spawn()` with discrete argument arrays and `shell: false`.
- Standard input is severed (`-nostdin`).
- The system `PATH` environment variable is stripped from the child process environment to prevent DLL planting or binary hijacking.

### 4. Filesystem Boundaries & Atomic Operations
- Only user-designated files selected through native OS dialogs are processed.
- System directories (`C:\Windows`, `%ProgramFiles%`) and drive roots (`C:\`) are explicitly blocked.
- UNC paths (`\\host\share`) are rejected to prevent NTLMv2 credential harvesting.
- Intermediate transcodes write to an isolated application temp folder in `%LOCALAPPDATA%\SecureVideoCompressor\temp` using 128-bit cryptographically random names.
- Outputs are finalized via atomic rename or cross-partition copy with byte-level size verification.

### 5. Privacy by Design
- Strips container metadata by default (`-map_metadata -1 -map_chapters -1`).
- Diagnostic logs redact usernames and user profile paths.
- No third-party analytics, crash reporters, or telemetry services exist in the codebase.
