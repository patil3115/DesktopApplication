import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { logger } from '../utils/logger';

/**
 * TempFileManager
 * Manages dedicated, isolated temporary file directory in %LOCALAPPDATA%\SecureVideoCompressor\temp
 * - Unpredictable 128-bit random names
 * - Tracks active temp files
 * - Atomic and deterministic cleanup on success, cancel, or crash recovery
 */
export class TempFileManager {
  private tempDir: string;
  private activeFiles: Set<string> = new Set();

  constructor() {
    // Dedicated app temp directory in user's local appdata
    const baseDir = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    this.tempDir = path.join(baseDir, 'SecureVideoCompressor', 'temp');
    this.ensureDirectoryExists();
  }

  public getTempDirectory(): string {
    return this.tempDir;
  }

  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
      }
    } catch (err) {
      logger.error('Failed to create secure temp directory', err);
      // Fallback to os.tmpdir inside an app-specific isolated folder
      this.tempDir = path.join(os.tmpdir(), 'SecureVideoCompressor_temp');
      fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generates a secure, cryptographically random temporary file path
   */
  public createTempFilePath(extension = '.mp4'): string {
    this.ensureDirectoryExists();
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
    const filePath = path.join(this.tempDir, `svc_${randomHex}${safeExt}`);
    this.activeFiles.add(filePath);
    return filePath;
  }

  /**
   * Cleans up a specific temporary file
   */
  public async cleanupFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info('Purged temporary file', filePath);
      }
    } catch (err) {
      logger.warn('Failed to delete temporary file', err);
    } finally {
      this.activeFiles.delete(filePath);
    }
  }

  /**
   * Cleans up all tracked active temporary files
   */
  public async cleanupAllActive(): Promise<void> {
    const files = Array.from(this.activeFiles);
    for (const f of files) {
      await this.cleanupFile(f);
    }
  }

  /**
   * Startup crash-recovery cleaner:
   * Scans the dedicated temp folder and deletes any leftover `svc_*.mp4` files from prior sessions.
   * Does NOT touch any other directory or unrelated files.
   */
  public cleanOrphanedCrashFiles(): void {
    try {
      if (!fs.existsSync(this.tempDir)) return;
      const entries = fs.readdirSync(this.tempDir);
      for (const entry of entries) {
        if (entry.startsWith('svc_') && (entry.endsWith('.mp4') || entry.endsWith('.tmp'))) {
          const fullPath = path.join(this.tempDir, entry);
          try {
            fs.unlinkSync(fullPath);
            logger.info('Cleaned orphaned crash temp file', entry);
          } catch (err) {
            // Ignore single file lock
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to clean orphaned crash temp files', err);
    }
  }

  public getTempDir(): string {
    return this.tempDir;
  }
}

export const tempManager = new TempFileManager();
