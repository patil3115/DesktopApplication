import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { logger } from '../utils/logger';

export interface BinaryVerificationResult {
  valid: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  error?: string;
}

/**
 * Calculates SHA-256 hash of a file synchronously
 */
export function calculateSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex').toLowerCase();
}

/**
 * BinaryResolver
 * Strictly isolates FFmpeg/FFprobe to application-controlled bundle directory.
 * Refuses to fall back to system PATH.
 */
export class BinaryResolver {
  private ffmpegPath: string | null = null;
  private ffprobePath: string | null = null;
  private isVerified = false;

  private getExpectedBinDir(): string {
    const isPackaged = app ? app.isPackaged : false;
    if (isPackaged) {
      return path.join(process.resourcesPath, 'bin', 'win32-x64');
    }
    // Development mode: relative to project root
    return path.resolve(__dirname, '../../../resources/bin/win32-x64');
  }

  public verifyBinaries(): BinaryVerificationResult {
    const binDir = this.getExpectedBinDir();
    const ffmpegCandidate = path.join(binDir, 'ffmpeg.exe');
    const ffprobeCandidate = path.join(binDir, 'ffprobe.exe');

    logger.info('Resolving bundled binaries from directory', binDir);

    if (!fs.existsSync(ffmpegCandidate)) {
      return {
        valid: false,
        ffmpegPath: '',
        ffprobePath: '',
        error: `Bundled ffmpeg.exe was not found in application resources.`
      };
    }

    if (!fs.existsSync(ffprobeCandidate)) {
      return {
        valid: false,
        ffmpegPath: '',
        ffprobePath: '',
        error: `Bundled ffprobe.exe was not found in application resources.`
      };
    }

    // Check optional checksums.json manifest
    const checksumManifestPath = path.join(binDir, 'checksums.json');
    if (fs.existsSync(checksumManifestPath)) {
      try {
        const manifestRaw = fs.readFileSync(checksumManifestPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw) as Record<string, string>;

        if (manifest['ffmpeg.exe']) {
          const actualFfmpegHash = calculateSha256(ffmpegCandidate);
          if (actualFfmpegHash !== manifest['ffmpeg.exe'].toLowerCase()) {
            logger.security('FFmpeg binary SHA-256 mismatch detected!');
            return {
              valid: false,
              ffmpegPath: '',
              ffprobePath: '',
              error: 'FFmpeg binary integrity check failed. Binary may be corrupted or modified.'
            };
          }
        }

        if (manifest['ffprobe.exe']) {
          const actualFfprobeHash = calculateSha256(ffprobeCandidate);
          if (actualFfprobeHash !== manifest['ffprobe.exe'].toLowerCase()) {
            logger.security('FFprobe binary SHA-256 mismatch detected!');
            return {
              valid: false,
              ffmpegPath: '',
              ffprobePath: '',
              error: 'FFprobe binary integrity check failed. Binary may be corrupted or modified.'
            };
          }
        }
      } catch (err) {
        logger.warn('Checksum manifest parsing warning', err);
      }
    }

    this.ffmpegPath = ffmpegCandidate;
    this.ffprobePath = ffprobeCandidate;
    this.isVerified = true;

    logger.info('Bundled FFmpeg and FFprobe binaries successfully verified.');
    return {
      valid: true,
      ffmpegPath: this.ffmpegPath,
      ffprobePath: this.ffprobePath
    };
  }

  public getFfmpegPath(): string {
    if (!this.isVerified || !this.ffmpegPath) {
      const res = this.verifyBinaries();
      if (!res.valid || !this.ffmpegPath) {
        throw new Error(res.error || 'FFmpeg binary is not available.');
      }
    }
    return this.ffmpegPath;
  }

  public getFfprobePath(): string {
    if (!this.isVerified || !this.ffprobePath) {
      const res = this.verifyBinaries();
      if (!res.valid || !this.ffprobePath) {
        throw new Error(res.error || 'FFprobe binary is not available.');
      }
    }
    return this.ffprobePath;
  }
}

export const binaryResolver = new BinaryResolver();
