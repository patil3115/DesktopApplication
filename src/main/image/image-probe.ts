import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ImageMetadata, ImageInputFormat, StructuredError } from '../../common/types';
import { formatBytes } from '../../common/formatters';
import { binaryResolver } from '../ffmpeg/binary-resolver';
import { logger } from '../utils/logger';

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
 * Generates an in-memory low-resolution WebP thumbnail (max 128x128) via bundled FFmpeg stdout pipe.
 * 100% offline, zero disk writes, safe for rendering in UI.
 */
async function generateLocalImageThumbnail(
  ffmpegPath: string,
  imagePath: string
): Promise<string | undefined> {
  return new Promise((resolve) => {
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
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
          PATH: ''
        }
      });

      const chunks: Buffer[] = [];

      child.stdout.on('data', (d: Buffer) => {
        chunks.push(d);
      });

      child.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const buf = Buffer.concat(chunks);
          resolve(`data:image/webp;base64,${buf.toString('base64')}`);
        } else {
          resolve(undefined);
        }
      });

      child.on('error', () => {
        resolve(undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Probes image dimensions, pixel format, transparency, and creates a local thumbnail.
 */
export async function probeImageFile(
  filePath: string
): Promise<{ success: boolean; metadata?: ImageMetadata; error?: StructuredError }> {
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

      const child = spawn(ffprobePath, args, {
        shell: false,
        windowsHide: true,
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
          PATH: ''
        }
      });

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
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

    // Generate in-memory thumbnail
    const thumbnailDataUrl = await generateLocalImageThumbnail(ffmpegPath, filePath);

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
