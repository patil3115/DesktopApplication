import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  CompressionSettings,
  CompressionProgress,
  CompressionResult,
  StructuredError
} from '../../common/types';
import { binaryResolver } from './binary-resolver';
import { tempManager } from '../fs/temp-manager';
import { generateSafeDestinationPath, atomicMove } from '../fs/atomic-move';
import { verifySufficientDiskSpace } from '../utils/disk-space';
import { parseFfmpegProgress } from './progress-parser';
import { logger } from '../utils/logger';

export class CompressionJobSupervisor {
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

    logger.info('Received cancellation request for active compression job');
    this.isCancelling = true;

    const pid = this.activeProcess.pid;
    const tempToClean = this.activeTempPath;

    try {
      if (pid) {
        // On Windows, taskkill /PID <pid> /T /F ensures the entire process tree is terminated
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
      logger.warn('Failed to kill ffmpeg process tree', err);
    } finally {
      this.activeProcess = null;
      this.activeTempPath = null;
    }

    // Clean up partial temporary file
    if (tempToClean) {
      await tempManager.cleanupFile(tempToClean);
    }

    return true;
  }

  public async startCompression(
    inputPath: string,
    durationSeconds: number,
    settings: CompressionSettings,
    onProgress: (progress: CompressionProgress) => void,
    hasAudioInput: boolean = true
  ): Promise<{ success: boolean; result?: CompressionResult; error?: StructuredError }> {
    if (this.isRunning()) {
      return {
        success: false,
        error: {
          code: 'ALREADY_RUNNING',
          userMessage: 'A compression task is already running. Please wait or cancel.'
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

    // Disk space check
    const spaceCheck = await verifySufficientDiskSpace(targetDir, inputStat.size);
    if (!spaceCheck.sufficient) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_DISK_SPACE',
          userMessage: `Insufficient free disk space. At least ${Math.round(spaceCheck.requiredBytes / (1024 * 1024))} MB required.`
        }
      };
    }

    // Create secure random temporary destination
    const tempOutputPath = tempManager.createTempFilePath('.mp4');
    this.activeTempPath = tempOutputPath;
    this.isCancelling = false;

    // Build controlled parameter list
    const args: string[] = ['-nostdin', '-y', '-i', inputPath];

    // Video codec & pixel format
    const vCodec = settings.codec === 'h265' ? 'libx265' : 'libx264';
    args.push('-c:v', vCodec, '-pix_fmt', 'yuv420p');

    // Quality mapping
    const crfMap: Record<string, string> = {
      high: '20',
      medium: '24',
      low: '28'
    };
    const presetMap: Record<string, string> = {
      high: 'slow',
      medium: 'medium',
      low: 'fast'
    };
    args.push('-crf', crfMap[settings.quality] ?? '24');
    args.push('-preset', presetMap[settings.quality] ?? 'medium');

    // Resolution scaling
    const resolutionScaleMap: Record<string, string> = {
      '1080p': 'scale=-2:1080',
      '720p': 'scale=-2:720',
      '480p': 'scale=-2:480'
    };
    if (settings.resolution !== 'original' && resolutionScaleMap[settings.resolution]) {
      args.push('-vf', resolutionScaleMap[settings.resolution]!);
    }

    // Metadata privacy preservation
    if (settings.removeMetadata) {
      args.push('-map_metadata', '-1', '-map_chapters', '-1');
    }

    // Explicit stream mapping: primary video stream always mapped to output stream 0
    args.push('-map', '0:v:0');

    // Audio settings
    if (settings.audioCodec === 'none' || !hasAudioInput) {
      args.push('-an');
    } else {
      args.push('-map', '0:a:0?');
      if (settings.audioCodec === 'copy') {
        args.push('-c:a', 'copy');
      } else {
        const audioBitrateMap: Record<string, string> = {
          high: '192k',
          medium: '128k',
          low: '96k'
        };
        args.push('-c:a', 'aac', '-b:a', audioBitrateMap[settings.quality] ?? '128k');
      }
    }

    // Force normalized standard MP4 timescale (90kHz) to prevent 32-bit timestamp overflow
    // with variable frame rate screen recordings having high fractional time bases (e.g., 2.1 billion tbn)
    args.push('-video_track_timescale', '90000');

    // Streaming web optimization (places MOOV atom at beginning)
    args.push('-movflags', '+faststart');

    // Safe temporary destination
    args.push(tempOutputPath);

    logger.info('Starting FFmpeg transcode with controlled args', {
      input: '[redacted]',
      videoCodec: vCodec,
      audioCodec: settings.audioCodec,
      resolution: settings.resolution,
      fps: 'preserved (standard timescale 90000)',
      quality: settings.quality,
      crf: crfMap[settings.quality] ?? '24',
      preset: presetMap[settings.quality] ?? 'medium'
    });

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

        // Keep buffer bounded
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

        logger.error('FFmpeg child process encountered error', err);
        resolve({
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: 'Compression failed to initialize.'
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
              userMessage: 'Video compression was cancelled by the user.'
            }
          });
        }

        if (code !== 0) {
          await tempManager.cleanupFile(tempOutputPath);

          let errorCode: StructuredError['code'] = 'COMPRESSION_FAILED';
          let userMessage = 'Video compression failed.';

          const lowerStderr = stderrBuffer.toLowerCase();
          if (lowerStderr.includes('no space left') || lowerStderr.includes('disk full')) {
            errorCode = 'INSUFFICIENT_DISK_SPACE';
            userMessage = 'Compression aborted: destination disk ran out of space.';
          } else if (lowerStderr.includes('pts/dts pair unsupported') || lowerStderr.includes('error muxing a packet')) {
            errorCode = 'MUXER_FAILURE';
            userMessage = 'Muxing error encountered during output packet assembly.';
          } else if (lowerStderr.includes('invalid argument') || lowerStderr.includes('unrecognized option')) {
            errorCode = 'INVALID_ENCODER_ARGUMENT';
            userMessage = 'Invalid encoder configuration argument.';
          } else if (lowerStderr.includes('unknown encoder') || lowerStderr.includes('cannot find encoder')) {
            errorCode = 'ENCODER_UNAVAILABLE';
            userMessage = 'The selected video or audio encoder is unavailable.';
          } else if (lowerStderr.includes('invalid data found') || lowerStderr.includes('error while decoding')) {
            errorCode = 'DECODER_FAILURE';
            userMessage = 'Input video contains corrupted or unreadable data packets.';
          } else {
            errorCode = 'COMPRESSION_FAILED';
            userMessage = 'Video compression encountered an unexpected processing error.';
          }

          logger.warn('FFmpeg process terminated with error', {
            code,
            classification: errorCode,
            sanitizedSnippet: stderrBuffer.slice(-300).trim()
          });

          return resolve({
            success: false,
            error: {
              code: errorCode,
              userMessage
            }
          });
        }

        // Verify output file existence and integrity
        try {
          if (!fs.existsSync(tempOutputPath)) {
            throw new Error('Temporary output file missing upon completion.');
          }

          const outStat = await fs.promises.stat(tempOutputPath);
          if (outStat.size === 0) {
            await tempManager.cleanupFile(tempOutputPath);
            throw new Error('Output file is 0 bytes.');
          }

          // Section 19: Lightweight ffprobe post-transcode validation
          const validation = await this.validateCompressedOutput(tempOutputPath, settings, hasAudioInput);
          if (!validation.valid) {
            await tempManager.cleanupFile(tempOutputPath);
            logger.warn('Output file validation failed', validation.reason);
            return resolve({
              success: false,
              error: {
                code: 'OUTPUT_VALIDATION_FAILED',
                userMessage: validation.reason || 'Compressed video failed validation.'
              }
            });
          }

          // Generate final destination path
          const finalDestPath = generateSafeDestinationPath(inputPath, settings.customOutputDir);

          // Atomic move
          await atomicMove(tempOutputPath, finalDestPath);

          const reductionBytes = inputStat.size - outStat.size;
          const reductionPercentage = Math.round(((reductionBytes / inputStat.size) * 100) * 10) / 10;

          logger.info('Compression completed successfully', finalDestPath);

          resolve({
            success: true,
            result: {
              success: true,
              outputPath: finalDestPath,
              outputFileName: path.basename(finalDestPath),
              originalSizeBytes: inputStat.size,
              compressedSizeBytes: outStat.size,
              reductionPercentage,
              durationSeconds
            }
          });
        } catch (postErr) {
          logger.error('Post-compression processing error', postErr);
          await tempManager.cleanupFile(tempOutputPath);
          resolve({
            success: false,
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: 'Failed to finalize output file.'
            }
          });
        }
      });
    });
  }

  private async validateCompressedOutput(
    outputPath: string,
    settings: CompressionSettings,
    hasAudioInput: boolean
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const ffprobePath = binaryResolver.getFfprobePath();
      const args = [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size:stream=index,codec_type,width,height',
        '-of',
        'json',
        outputPath
      ];

      return new Promise((res) => {
        let stdout = '';
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

        child.on('close', (code) => {
          if (code !== 0 || !stdout) {
            return res({ valid: false, reason: 'Generated video container is unreadable or corrupted.' });
          }
          try {
            const parsed = JSON.parse(stdout);
            const streams = parsed.streams || [];
            const video = streams.find((s: { codec_type?: string }) => s.codec_type === 'video');
            if (!video || !video.width || !video.height) {
              return res({ valid: false, reason: 'Generated output has no valid video stream.' });
            }

            if (settings.audioCodec !== 'none' && hasAudioInput) {
              const audio = streams.find((s: { codec_type?: string }) => s.codec_type === 'audio');
              if (!audio) {
                return res({ valid: false, reason: 'Generated output is missing expected audio track.' });
              }
            }

            const duration = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0;
            if (duration <= 0) {
              return res({ valid: false, reason: 'Generated output has invalid or zero duration.' });
            }

            res({ valid: true });
          } catch {
            res({ valid: false, reason: 'Failed to parse generated output metadata.' });
          }
        });

        child.on('error', () => {
          res({ valid: false, reason: 'Output validation check process failed.' });
        });
      });
    } catch {
      return { valid: false, reason: 'Output validation check could not be executed.' };
    }
  }
}

export const jobSupervisor = new CompressionJobSupervisor();
