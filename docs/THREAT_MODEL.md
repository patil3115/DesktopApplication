# Threat Model: Secure Video Compressor

**Document Version:** 1.0.0  
**Target:** Secure Video Compressor (Windows Desktop Application)  
**Methodology:** STRIDE + Defense-in-Depth  
**Status:** Approved Architecture

---

## 1. System Overview & Asset Inventory

### 1.1 Primary Assets
1. **User Video Assets:** Raw user-provided video files that may contain confidential imagery, private conversations, location tags (GPS), personal metadata, or proprietary intellectual property.
2. **Host System Integrity:** Operating system files, registry, credential stores, environment variables, user profile directories (`%USERPROFILE%`), and child process namespaces.
3. **Application Temp Storage:** Intermediate transcoded video segments and temporary state files stored on disk.
4. **User Trust & Privacy Guarantee:** The invariant that no bytes of the video or its metadata are uploaded or transmitted outside the host.

---

## 2. Threat Actor Profiles

| Actor Profile | Description | Capabilities | Motivation |
|---|---|---|---|
| **External Attacker via Malicious Media** | Distributes specially crafted or weaponized video files to user. | Can embed corrupted headers, buffer overflow exploits, path traversal strings in filenames/tags. | Local Code Execution (RCE) via FFmpeg or Chromium parser exploits. |
| **Malicious Web Page / XSS Attacker** | Attacker who manages to deliver a payload if renderer security is weak. | Attempts arbitrary IPC calls, DOM manipulation, or exfiltration. | Steal files, execute commands, bypass sandbox. |
| **Local Low-Privilege User / Process** | Other local applications or users running on the same multi-user Windows machine. | Can read shared directories (e.g., standard `%TEMP%`), watch process listings, inspect handles. | Intercept decrypted/transcoded video frames or sensitive metadata. |
| **Supply Chain Adversary** | Compromised npm package in dependencies. | Attempts phone-home, reverse shell, or stealing user files. | Exfiltration of user data, cryptomining. |

---

## 3. Detailed Threat Analysis (T1 – T9)

### T1: Malicious Video File (FFmpeg Demuxer / Parser Vulnerability)
- **Threat Vector:** Attacker provides an MP4/MKV file containing out-of-bounds read/write triggers against FFmpeg codecs.
- **Impact:** Subprocess crash (DoS) or arbitrary code execution in the context of the FFmpeg child process.
- **Mitigation:**
  1. FFmpeg runs as a dedicated, unprivileged child process without inherited network credentials or admin tokens.
  2. Input probing uses strict format timeouts and rejects invalid media streams early.
  3. No interactive shell or shell execution is ever invoked.
  4. Standard input (`stdin`) is disabled (`-nostdin`).
  5. The child process working directory is locked to the isolated application temp directory.

### T2: Command Injection via Malformed Filename
- **Threat Vector:** Filename crafted with command separators or shell operators, e.g.:
  `test.mp4 & calc.exe`  
  `test.mp4; rm -rf /`  
  `test.mp4 | powershell -c "..."`  
  `test.mp4" --eval="...`  
- **Impact:** Arbitrary command execution on the host machine.
- **Mitigation:**
  1. **Strict avoidance of `child_process.exec()`**.
  2. **`child_process.spawn()` or `spawnFile()` is exclusively used** with explicit array arguments.
  3. `shell: false` is strictly enforced.
  4. Filenames and paths are validated using strict regex and Windows file API verification before passing to the argument list.

### T3: Path Traversal and Unauthorized File Access
- **Threat Vector:** Renderer sends crafted paths such as:
  `..\..\..\Windows\System32\drivers\etc\hosts`  
  `C:\Users\Admin\AppData\Local\Google\Chrome\User Data\Default\Login Data`  
  `\\attacker-server\share\exploit.mp4` (UNC path to leak NTLMv2 hash).
- **Impact:** Arbitrary file read/write, credential leakage via SMB.
- **Mitigation:**
  1. Rejection of all UNC paths (`\\`, `//`).
  2. Path canonicalization via `path.resolve()` and `fs.realpathSync()`.
  3. Rejection of system directory paths (`%WINDIR%`, `%PROGRAMFILES%`).
  4. Only files selected through Electron's native `dialog.showOpenDialog` or validated drop events are processed.
  5. Verification that the target is a normal file (`stats.isFile()`) and not a symlink, FIFO, or directory.

### T4: Renderer Process Compromise & Privilege Escalation
- **Threat Vector:** Exploitation of a vulnerability in React, a UI library, or Chromium to execute code inside the Renderer process.
- **Impact:** Attacker tries to break out to the operating system.
- **Mitigation:**
  1. `contextIsolation: true` prevents prototype pollution between web context and preload.
  2. `nodeIntegration: false` ensures Node.js APIs are completely undefined in the renderer.
  3. `sandbox: true` confines the renderer to the OS-level Chromium sandbox.
  4. Navigation is locked down: `will-navigate` is blocked, `setWindowOpenHandler` denies all popups.
  5. CSP header: `connect-src 'none'; default-src 'self'`.
  6. Preload script exposes only a tight, frozen API object via `contextBridge.exposeInMainWorld`.

### T5: Malicious Dependency / Supply Chain Injection
- **Threat Vector:** A compromised third-party npm package executes malicious code during build or runtime to leak files or passwords.
- **Impact:** Backdoor, secret exfiltration, supply chain compromise.
- **Mitigation:**
  1. Minimalist dependency philosophy: Zero extraneous dependencies. No analytics, no telemetry, no remote styling libraries.
  2. Exact lockfile (`package-lock.json`) committed and verified with `npm audit`.
  3. Strict Content Security Policy blocks network requests (`connect-src 'none'`) at runtime.
  4. Renderer cannot initiate outbound network sockets.

### T6: Privacy Leakage via Metadata & Diagnostic Logs
- **Threat Vector:** User video contains EXIF metadata: GPS coordinates, device serial numbers, owner name. The app logs this information or preserves it in compressed output.
- **Impact:** User location or identity leaks when they share the compressed video.
- **Mitigation:**
  1. Default-on privacy setting: **"Remove metadata from compressed video"** passes `-map_metadata -1 -map_chapters -1` to FFmpeg.
  2. Privacy-safe logger: File paths logged internally are redacted (e.g. `C:\Users\<USER>\Videos\<FILE>`).
  3. Video content or raw frames are never written to log files.
  4. No external log shipping or crash analytics.

### T7: Insecure Temporary File Staging
- **Threat Vector:** Intermediate transcoding chunks are written to the public `%TEMP%` directory with predictable filenames, allowing concurrent local processes to read video frames.
- **Impact:** Confidentiality breach of user media.
- **Mitigation:**
  1. Application-controlled temporary directory in `%LOCALAPPDATA%\SecureVideoCompressor\temp` created with secure user-only permissions.
  2. Intermediate files named using cryptographically secure randomness: `crypto.randomBytes(16).toString('hex') + '.tmp.mp4'`.
  3. Immediate cleanup on job completion, job cancellation, or error.
  4. Startup crash-recovery cleaner purges any orphaned temp files from prior aborted sessions.

### T8: Resource Exhaustion & Denial of Service (DoS)
- **Threat Vector:** User submits an excessively large file (e.g., 200 GB) or launches multiple simultaneous compressions, exhausting system RAM, disk space, or CPU.
- **Impact:** System freeze, disk out-of-space error, application crash.
- **Mitigation:**
  1. Concurrency limit = 1 (enforced by a state machine in Main).
  2. Pre-compression disk space inspection: requires free space >= 1.2x input file size.
  3. Cancellation kills the full FFmpeg process tree (`taskkill /T /F /PID`) cleanly without dangling zombie processes.
  4. FFmpeg is executed with low/normal priority to avoid starving host OS scheduling.

### T9: Accidental Overwrite of Original Media
- **Threat Vector:** Compression defaults to the original input path, corrupting or destroying the user's master video on error.
- **Impact:** Irreversible data loss.
- **Mitigation:**
  1. Default output filename appends `_compressed` (e.g., `clip_compressed.mp4`).
  2. If a collision exists, an incrementing counter (`_compressed_1.mp4`) is used.
  3. Original files are never overwritten without explicit, modal user confirmation.
  4. Staging in temporary directory ensures the original is never modified in-place.

---

## 4. Threat Matrix Summary

| Threat ID | Threat Vector | Likelihood | Impact | Residual Risk | Status |
|---|---|---|---|---|---|
| **T1** | Malicious Video File | Medium | High | Low | Mitigated by Subprocess Sandboxing & Input Probing |
| **T2** | Shell Command Injection | High | Critical | Zero | Mitigated by strict `spawn(..., args, { shell: false })` |
| **T3** | Path Traversal / UNC Abuse | High | High | Zero | Mitigated by Canonicalization & UNC rejection |
| **T4** | Renderer Compromise | Low | Critical | Low | Mitigated by Sandbox, Context Isolation, strict CSP |
| **T5** | Dependency Poisoning | Medium | High | Low | Mitigated by Zero-telemetry policy, connect-src 'none' |
| **T6** | Metadata Privacy Leak | High | High | Low | Mitigated by `-map_metadata -1` by default & Redacted Logging |
| **T7** | Insecure Temp Files | Medium | Medium | Zero | Mitigated by Isolated temp dir & Crypto-random naming |
| **T8** | Resource Exhaustion | Medium | Medium | Low | Mitigated by Single concurrency & Disk space check |
| **T9** | Output Overwrite Loss | High | High | Zero | Mitigated by Staged atomic write & `_compressed` default |
