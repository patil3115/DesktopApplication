import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ImageMetadata, ImageInputFormat, StructuredError } from '../../common/types';
import { formatBytes } from '../../common/formatters';
import { binaryResolver } from '../ffmpeg/binary-resolver';
import { logger } from '../utils/logger';

// Safely obtain nativeImage from Electron when running in Electron main process
let electronNativeImage: typeof import('electron').nativeImage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron: any = require('electron');
  if (electron && typeof electron === 'object' && electron.nativeImage) {
    electronNativeImage = electron.nativeImage;
  }
} catch {
  electronNativeImage = null;
}

const ALPHA_PIX_FMTS: ReadonlySet<string> = new Set<string>([
  'rgba',
  'bgra',
  'argb',
  'abgr',
  'yuva420p',
  'yuva422p',
  'yuva444p',
  'ya8',
  'pal8'
]);

/**
 * Attempts to generate a local thumbnail using Electron's nativeImage API.
 * High performance (~15ms), zero child process overhead, zero pipe deadlock risk.
 */
function generateLocalImageThumbnailNative(imagePath: string): string | undefined {
  if (!electronNativeImage) return undefined;
  try {
    const img = electronNativeImage.createFromPath(imagePath);
    if (!img.isEmpty()) {
      const thumb = img.resize({ width: 128, height: 128, quality: 'good' });
      return thumb.toDataURL();
    }
  } catch (err) {
    logger.warn('[IMAGE] nativeImage thumbnail generation failed for ' + imagePath, err);
  }
  return undefined;
}

/**
 * Generates an in-memory low-resolution WebP thumbnail (max 128x128) via bundled FFmpeg stdout pipe.
 * Hardened with:
 * 1. Continuous stderr draining to prevent OS pipe buffer deadlocks.
 * 2. Strict timeout with SIGKILL to guarantee resolution.
 * 3. 100% offline, zero disk writes.
 */
async function generateLocalImageThumbnailFfmpeg(
  ffmpegPath: string,
  imagePath: string,
  timeoutMs = 3000
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const safeResolve = (val: string | undefined) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(val);
    };

    try {
      const args = [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        imagePath,
        '-vf',
        'scale=128:128:force_original_aspect_ratio=decrease',
        '-frames:v',
        '1',
        '-c:v',
        'webp',
        '-q:v',
        '65',
        '-f',
        'image2pipe',
        '-'
      ];

      const child = spawn(ffmpegPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
          PATH: ''
        }
      });

      timer = setTimeout(() => {
        logger.warn(`[IMAGE] FFmpeg thumbnail timed out after ${timeoutMs}ms for: ${imagePath}`);
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        safeResolve(undefined);
      }, timeoutMs);

      const chunks: Buffer[] = [];

      child.stdout.on('data', (d: Buffer) => {
        chunks.push(d);
      });

      // Crucial: Drain stderr continuously to prevent Windows pipe buffer deadlock
      child.stderr.on('data', () => {});

      child.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const buf = Buffer.concat(chunks);
          safeResolve(`data:image/webp;base64,${buf.toString('base64')}`);
        } else {
          safeResolve(undefined);
        }
      });

      child.on('error', () => {
        safeResolve(undefined);
      });
    } catch {
      safeResolve(undefined);
    }
  });
}

/**
 * Thumbnail generator orchestrator.
 * Tries nativeImage first (instant, 15ms), then falls back to hardened FFmpeg.
 * Never throws and never blocks metadata inspection.
 */
async function generateThumbnail(ffmpegPath: string, imagePath: string): Promise<string | undefined> {
  logger.info(`[IMAGE] Starting thumbnail generation: ${imagePath}`);
  console.log(`[IMAGE] Starting thumbnail generation: ${imagePath}`);

  // 1. Try nativeImage first
  const nativeThumb = generateLocalImageThumbnailNative(imagePath);
  if (nativeThumb) {
    logger.info(`[IMAGE] Thumbnail generation completed: ${imagePath}`);
    console.log(`[IMAGE] Thumbnail generation completed: ${imagePath}`);
    return nativeThumb;
  }

  // 2. FFmpeg fallback with strict timeout and pipe drainage
  try {
    const ffmpegThumb = await generateLocalImageThumbnailFfmpeg(ffmpegPath, imagePath, 3000);
    if (ffmpegThumb) {
      logger.info(`[IMAGE] Thumbnail generation completed: ${imagePath}`);
      console.log(`[IMAGE] Thumbnail generation completed: ${imagePath}`);
      return ffmpegThumb;
    }
  } catch (err) {
    logger.warn('[IMAGE] FFmpeg thumbnail generation error: ' + imagePath, err);
  }

  logger.warn(`[IMAGE] Thumbnail generation failed or timed out, using fallback icon: ${imagePath}`);
  console.log(`[IMAGE] Thumbnail generation failed or timed out, using fallback icon: ${imagePath}`);
  return undefined;
}

/**
 * Probes image dimensions, pixel format, transparency, and creates a local thumbnail.
 */
export async function probeImageFile(
  filePath: string
): Promise<{ success: boolean; metadata?: ImageMetadata; error?: StructuredError }> {
  logger.info(`[IMAGE] Starting metadata inspection: ${filePath}`);
  console.log(`[IMAGE] Starting metadata inspection: ${filePath}`);

  let ffprobePath: string;
  let ffmpegPath: string;

  try {
    ffprobePath = binaryResolver.getFfprobePath();
    ffmpegPath = binaryResolver.getFfmpegPath();
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'FFMPEG_NOT_FOUND',
        userMessage: 'Bundled media engine binary could not be located.'
      }
    };
  }

  try {
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') as ImageInputFormat;

    const args = [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,width,height,pix_fmt:format=format_name,size',
      '-of',
      'json',
      filePath
    ];

    const probeOutput = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const child = spawn(ffprobePath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
          PATH: ''
        }
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(new Error(`ffprobe timed out after 5000ms for ${filePath}`));
        }
      }, 5000);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
          }
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    const parsed = JSON.parse(probeOutput);
    const videoStream = parsed.streams && parsed.streams[0];

    if (!videoStream || !videoStream.width || !videoStream.height) {
      return {
        success: false,
        error: {
          code: 'PROBE_FAILED',
          userMessage: 'Image contains no readable image stream or dimensions.'
        }
      };
    }

    const width = parseInt(videoStream.width, 10);
    const height = parseInt(videoStream.height, 10);
    const pixFmt = String(videoStream.pix_fmt || '').toLowerCase();
    const hasAlpha = ALPHA_PIX_FMTS.has(pixFmt);
    const aspectRatio = width / height;

    logger.info(`[IMAGE] Metadata inspection completed: ${filePath}`);
    console.log(`[IMAGE] Metadata inspection completed: ${filePath}`);

    // Generate in-memory thumbnail (isolated: failure/timeout NEVER fails metadata inspection)
    let thumbnailDataUrl: string | undefined;
    try {
      thumbnailDataUrl = await generateThumbnail(ffmpegPath, filePath);
    } catch (thumbErr) {
      logger.warn('[IMAGE] Isolated thumbnail error for ' + filePath, thumbErr);
      thumbnailDataUrl = undefined;
    }

    const metadata: ImageMetadata = {
      fileName: path.basename(filePath),
      filePath,
      fileSizeBytes: stat.size,
      formattedSize: formatBytes(stat.size),
      format: (ext === 'jpeg' ? 'jpg' : ext) as ImageInputFormat,
      width,
      height,
      aspectRatio,
      hasAlpha,
      thumbnailDataUrl,
      thumbnailBase64: thumbnailDataUrl
    };

    return {
      success: true,
      metadata
    };
  } catch (err) {
    logger.warn('Image probe failed for file: ' + filePath, err);
    return {
      success: false,
      error: {
        code: 'PROBE_FAILED',
        userMessage: 'Failed to inspect image file metadata. File may be corrupted or unsupported.'
      }
    };
  }
}
