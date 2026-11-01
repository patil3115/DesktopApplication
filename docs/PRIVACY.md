# Privacy Policy & Architecture: Secure Video Compressor

**Application:** Secure Video Compressor  
**Classification:** Privacy-First, Air-Gapped Desktop Software  
**Version:** 1.0.0  

---

## 1. Core Privacy Commitments

1. **Zero Data Transmission:** The application does not contain code to transmit files, media frames, metadata, diagnostic metrics, telemetry, or user activity over the internet.
2. **Local-Only Transcoding:** All video processing, probing, scaling, and compression is executed locally using dedicated on-device binaries.
3. **Zero Analytics & Telemetry:** There are no tracking scripts, Google Analytics, Sentry, Mixpanel, Datadog, or crash reporters.
4. **No User Accounts:** The application requires no email, phone number, login, license key, or authentication tokens.
5. **No Remote Assets:** All icons, stylesheets, scripts, fonts, and assets are packaged within the local application binary. The application makes zero HTTP/HTTPS requests at runtime.

---

## 2. Metadata Privacy Architecture

Video containers (MP4, MOV, MKV) commonly store embedded metadata tracks, including:
- Exact GPS latitude, longitude, and elevation of recording
- Device make, model, serial number, and firmware version
- Creation, modification, and recording date/time timestamps
- Author, artist, and editing software names
- Embedded thumbnail images and chapter titles

### Privacy Guarantee:
- The default compression configuration enables **"Remove metadata from compressed video"**.
- When enabled, the FFmpeg invocation passes flags:
  ```text
  -map_metadata -1 -map_chapters -1
  ```
- This completely strips private metadata streams from the container, ensuring that videos shared to social media, messaging apps, or public platforms do not inadvertently disclose private location or personal device markers.

---

## 3. Privacy-Safe Logging Policy

To aid local debugging without compromising user confidentiality:
1. **Username Redaction:** File paths printed to local debugging outputs sanitize the current user profile:
   ```text
   C:\Users\JohnDoe\Videos\MyPrivateHomeVideo.mp4
   --> C:\Users\<REDACTED>\Videos\<FILE>.mp4
   ```
2. **No Video Content Logging:** Frame bytes, audio samples, and image thumbnails are never written to disk logs.
3. **No Network Sockets:** The logging system outputs strictly to standard console output or local log rotation files; it has no network emitter.

---

## 4. Temporary File Hygiene

1. Intermediate transcoding artifacts are written to a dedicated, restricted application directory in `%LOCALAPPDATA%\SecureVideoCompressor\temp`.
2. Temporary files are named using cryptographically random 128-bit hex tokens.
3. Temporary files are purged immediately upon:
   - Successful compression completion
   - User cancellation
   - Transcoding failure / error
   - Next application startup (crash recovery cleaner)
