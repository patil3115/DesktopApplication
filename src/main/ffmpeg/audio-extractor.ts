import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  AudioExtractionSettings,
  AudioExtractionResult,
  CompressionProgress,
  StructuredError,
  AudioStreamInfo
} from '../../common/types';
import { binaryResolver } from './binary-resolver';
import { tempManager } from '../fs/temp-manager';
import { atomicMove } from '../fs/atomic-move';
import { verifySufficientDiskSpace } from '../utils/disk-space';
import { parseFfmpegProgress } from './progress-parser';
import { logger } from '../utils/logger';
import { formatBytes } from '../../common/formatters';

/**
 * Generates a collision-safe audio destination path:
 * e.g., input.mp4 -> input.mp3, or input (1).mp3 if input.mp3 already exists.
 * Never overwrites an existing file silently.
 */
export function generateSafeAudioDestinationPath(
  originalInputPath: string,
  targetExtension: string,
  targetDirectory?: string | null
): string {
  const parsed = path.parse(originalInputPath);
  const outputDir = targetDirectory ? path.resolve(targetDirectory) : parsed.dir;
  const baseName = parsed.name;
  const ext = targetExtension.startsWith('.') ? targetExtension : `.${targetExtension}`;

  let candidate = path.join(outputDir, `${baseName}${ext}`);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${baseName} (${counter})${ext}`);
    counter++;
  }

  return candidate;
}

export class AudioExtractionSupervisor {
  private activeProcess: ChildProcess | null = null;
  private activeTempPath: string | null = null;
  private isCancelling = false;

  public isRunning(): boolean {
    return this.activeProcess !== null;
  }

  public async cancel(): Promise<boolean> {
    if (!this.activeProcess) {
      return false;
    }

    logger.info('Received cancellation request for active audio extraction job');
    this.isCancelling = true;

    const pid = this.activeProcess.pid;
    const tempToClean = this.activeTempPath;

    try {
      if (pid) {
        if (process.platform === 'win32') {
          spawn('taskkill.exe', ['/PID', pid.toString(), '/T', '/F'], {
            shell: false,
            windowsHide: true
          });
        } else {
          this.activeProcess.kill('SIGKILL');
        }
      }
    } catch (err) {
      logger.warn('Failed to kill audio extraction process tree', err);
    } finally {
      this.activeProcess = null;
      this.activeTempPath = null;
    }

    if (tempToClean) {
      await tempManager.cleanupFile(tempToClean);
    }

    return true;
  }

  public async startExtraction(
    inputPath: string,
    durationSeconds: number,
    selectedAudioStream: AudioStreamInfo,
    settings: AudioExtractionSettings,
    onProgress: (progress: CompressionProgress) => void
  ): Promise<{ success: boolean; result?: AudioExtractionResult; error?: StructuredError }> {
    if (this.isRunning()) {
      return {
        success: false,
        error: {
          code: 'ALREADY_RUNNING',
          userMessage: 'An audio extraction or compression task is already running. Please wait or cancel.'
        }
      };
    }

    let ffmpegPath: string;
    try {
      ffmpegPath = binaryResolver.getFfmpegPath();
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'FFMPEG_NOT_FOUND',
          userMessage: 'Bundled FFmpeg executable could not be found or verified.'
        }
      };
    }

    const inputStat = await fs.promises.stat(inputPath);
    const targetDir = settings.customOutputDir || path.dirname(inputPath);

    // Audio files are much smaller than video, check at least 500 MB free space
    const spaceCheck = await verifySufficientDiskSpace(targetDir, Math.min(inputStat.size, 500 * 1024 * 1024));
    if (!spaceCheck.sufficient) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_DISK_SPACE',
          userMessage: 'Insufficient free disk space for audio extraction.'
        }
      };
    }

    const ext = `.${settings.format}`;
    const tempOutputPath = tempManager.createTempFilePath(ext);
    this.activeTempPath = tempOutputPath;
    this.isCancelling = false;

    // Stream Copy Optimization:
    // If input codec matches output container format, copy without re-encoding!
    let wasStreamCopied = false;
    const inputCodecUpper = selectedAudioStream.codec.toUpperCase();

    if (
      (settings.format === 'm4a' && inputCodecUpper === 'AAC') ||
      (settings.format === 'mp3' && inputCodecUpper === 'MP3') ||
      (settings.format === 'flac' && inputCodecUpper === 'FLAC')
    ) {
      wasStreamCopied = true;
      logger.info(`Stream copy optimization active: copying ${inputCodecUpper} stream directly to ${settings.format}`);
    }

    // Build controlled argument list
    const args: string[] = ['-nostdin', '-y', '-i', inputPath];

    // Select the designated audio stream only
    args.push('-map', `0:a:${settings.audioStreamIndex}`);

    // Drop video
    args.push('-vn');

    // Codec & Quality mapping
    if (wasStreamCopied) {
      args.push('-c:a', 'copy');
    } else {
      switch (settings.format) {
        case 'mp3':
          args.push('-c:a', 'libmp3lame', '-b:a', settings.bitrate || '192k');
          break;
        case 'm4a':
          args.push('-c:a', 'aac', '-b:a', settings.bitrate || '192k');
          break;
        case 'wav':
          args.push('-c:a', 'pcm_s16le');
          break;
        case 'flac':
          args.push('-c:a', 'flac');
          break;
        case 'ogg':
          args.push('-c:a', 'libvorbis', '-b:a', settings.bitrate || '192k');
          break;
      }
    }

    // Privacy: remove metadata if requested
    if (settings.removeMetadata) {
      args.push('-map_metadata', '-1', '-map_chapters', '-1');
    }

    // Safe temporary destination
    args.push(tempOutputPath);

    logger.info(`Starting FFmpeg audio extraction (${settings.format})`);

    return new Promise((resolve) => {
      let stderrBuffer = '';

      const child = spawn(ffmpegPath, args, {
        shell: false,
        windowsHide: true,
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
          PATH: ''
        }
      });

      this.activeProcess = child;

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;

        if (stderrBuffer.length > 20000) {
          stderrBuffer = stderrBuffer.slice(-10000);
        }

        const progress = parseFfmpegProgress(text, durationSeconds);
        if (progress) {
          onProgress(progress);
        }
      });

      child.on('error', async (err) => {
        this.activeProcess = null;
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;

        logger.error('Audio extraction child process error', err);
        resolve({
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: 'Audio extraction process failed to initialize.'
          }
        });
      });

      child.on('close', async (code) => {
        this.activeProcess = null;
        this.activeTempPath = null;

        if (this.isCancelling) {
          await tempManager.cleanupFile(tempOutputPath);
          return resolve({
            success: false,
            error: {
              code: 'CANCELLED',
              userMessage: 'Audio extraction was cancelled by user.'
            }
          });
        }

        if (code !== 0) {
          logger.warn('Audio extraction FFmpeg exited with code', code);
          await tempManager.cleanupFile(tempOutputPath);
          return resolve({
            success: false,
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: 'Audio extraction failed. Input file may be damaged or unsupported.'
            }
          });
        }

        try {
          if (!fs.existsSync(tempOutputPath)) {
            throw new Error('Temporary audio output file missing.');
          }

          const outStat = await fs.promises.stat(tempOutputPath);
          if (outStat.size === 0) {
            await tempManager.cleanupFile(tempOutputPath);
            throw new Error('Extracted audio file is empty (0 bytes).');
          }

          const finalDestPath = generateSafeAudioDestinationPath(
            inputPath,
            settings.format,
            settings.customOutputDir
          );

          await atomicMove(tempOutputPath, finalDestPath);

          logger.info('Audio extraction completed successfully', finalDestPath);

          resolve({
            success: true,
            result: {
              success: true,
              outputPath: finalDestPath,
              outputFileName: path.basename(finalDestPath),
              format: settings.format,
              audioSizeBytes: outStat.size,
              formattedSize: formatBytes(outStat.size),
              durationSeconds,
              wasStreamCopied
            }
          });
        } catch (postErr) {
          logger.error('Post-extraction finalize error', postErr);
          await tempManager.cleanupFile(tempOutputPath);
          resolve({
            success: false,
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: 'Failed to finalize audio output file.'
            }
          });
        }
      });
    });
  }
}

export const audioExtractorSupervisor = new AudioExtractionSupervisor();
