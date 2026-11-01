# FFmpeg Binary Provenance & Verification

**Package Name:** Gyan.FFmpeg Essentials Build  
**Binary Version:** `9.0.2-essentials_build-www.gyan.dev`  
**Architecture:** Windows x64 (`win32-x64`)  
**Source:** https://www.gyan.dev/ffmpeg/builds/  
**License:** GNU General Public License v3.0 (GPLv3) / LGPL  
**Verification Date:** November 2026  

---

## Cryptographic Checksums (SHA-256)

| Binary File | SHA-256 Checksum |
|---|---|
| `ffmpeg.exe` | `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec` |
| `ffprobe.exe` | `f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52` |

---

## Verification Policy

1. **Local-Only Execution:** These binaries are executed strictly on the local machine via `child_process.spawn()` with discrete argument arrays and `shell: false`.
2. **Path Lockdown:** The application loads these binaries solely from `resources/bin/win32-x64/` (development) or `process.resourcesPath/bin/win32-x64/` (production). The system `PATH` is ignored and stripped from child process environment variables.
3. **Integrity Manifest:** The application computes the SHA-256 checksum at startup and compares it against `checksums.json` to prevent binary tampering or corruption.
