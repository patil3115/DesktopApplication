import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  CompressionSettings,
  CompressionProgress,
  CompressionResult,
  StructuredError,
  VideoMetadata
} from '../../common/types';
import {
  calculateMinTargetSizeBytes,
  calculateTargetBitrate,
  formatBytes
} from '../../common/target-size';
import { binaryResolver } from './binary-resolver';
import { tempManager } from '../fs/temp-manager';
import { generateSafeDestinationPath, atomicMove } from '../fs/atomic-move';
import { verifySufficientDiskSpace } from '../utils/disk-space';
import { parseFfmpegProgress } from './progress-parser';
import { logger } from '../utils/logger';

export class CompressionJobSupervisor {
  private activeProcess: ChildProcess | null = null;
  private activeTempPath: string | null = null;
  private activePassLogPrefix: string | null = null;
  private isCancelling = false;

  public isRunning(): boolean {
    return this.activeProcess !== null;
  }

  private async cleanupPassLogs(passLogPrefix: string | null): Promise<void> {
    if (!passLogPrefix) return;
    try {
      const dir = path.dirname(passLogPrefix);
      const base = path.basename(passLogPrefix);
      if (fs.existsSync(dir)) {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          if (file.startsWith(base)) {
            await fs.promises.unlink(path.join(dir, file)).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to clean up pass log files', err);
    }
  }

  public async cancel(): Promise<boolean> {
    if (!this.activeProcess) {
      return false;
    }

    logger.info('Received cancellation request for active compression job');
    this.isCancelling = true;

    const pid = this.activeProcess.pid;
    const tempToClean = this.activeTempPath;
    const passLogPrefixToClean = this.activePassLogPrefix;

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
      this.activePassLogPrefix = null;
    }

    // Clean up partial temporary file
    if (tempToClean) {
      await tempManager.cleanupFile(tempToClean);
    }

    // Clean up pass logs if two-pass was active
    if (passLogPrefixToClean) {
      await this.cleanupPassLogs(passLogPrefixToClean);
    }

    return true;
  }

  private runFfmpegProcess(
    ffmpegPath: string,
    args: string[],
    durationSeconds: number,
    onProgressUpdate?: (progress: CompressionProgress) => void
  ): Promise<{ code: number | null; stderr: string; error?: Error }> {
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

        if (onProgressUpdate) {
          const progress = parseFfmpegProgress(text, durationSeconds);
          if (progress) {
            onProgressUpdate(progress);
          }
        }
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        resolve({ code: -1, stderr: stderrBuffer, error: err });
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        resolve({ code, stderr: stderrBuffer });
      });
    });
  }

  private classifyStderrError(stderrBuffer: string): { code: StructuredError['code']; userMessage: string } {
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

    return { code: errorCode, userMessage };
  }

  public async startCompression(
    inputPath: string,
    durationSeconds: number,
    settings: CompressionSettings,
    onProgress: (progress: CompressionProgress) => void,
    hasAudioInput: boolean = true,
    metadata?: VideoMetadata
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
    this.activePassLogPrefix = null;
    this.isCancelling = false;

    const vCodec = settings.codec === 'h265' ? 'libx265' : 'libx264';
    const isH265 = settings.codec === 'h265';

    // Resolution scaling
    const resolutionScaleMap: Record<string, string> = {
      '1080p': 'scale=-2:1080',
      '720p': 'scale=-2:720',
      '480p': 'scale=-2:480'
    };

    let targetSizeForRecord: number | undefined = undefined;

    // =========================================================================
    // MODE: CUSTOM TARGET SIZE (TWO-PASS ENCODING)
    // =========================================================================
    if (settings.quality === 'custom') {
      let targetSizeBytes = settings.targetSizeBytes;
      if ((!targetSizeBytes || targetSizeBytes <= 0) && settings.targetPercent) {
        targetSizeBytes = Math.round(inputStat.size * (settings.targetPercent / 100));
      }
      if (!targetSizeBytes || targetSizeBytes <= 0) {
        targetSizeBytes = Math.round(inputStat.size * 0.5);
      }
      targetSizeForRecord = targetSizeBytes;

      // Validate dynamic minimum feasible size
      const minFeasibleBytes = calculateMinTargetSizeBytes({
        durationSeconds,
        width: metadata?.width,
        height: metadata?.height,
        fps: metadata?.fps,
        codec: settings.codec,
        audioCodec: settings.audioCodec,
        hasAudio: hasAudioInput,
        originalSizeBytes: inputStat.size
      });

      if (targetSizeBytes < minFeasibleBytes) {
        logger.warn('Target size below minimum feasible threshold', {
          targetSizeBytes,
          minFeasibleBytes
        });
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            userMessage: `Requested target size (${formatBytes(targetSizeBytes)}) is below the minimum technically feasible size (${formatBytes(minFeasibleBytes)}) for this video. Please select a larger target size.`
          }
        };
      }

      // Bitrate calculation
      const bitrateCalc = calculateTargetBitrate({
        targetSizeBytes,
        durationSeconds,
        codec: settings.codec,
        audioCodec: settings.audioCodec,
        hasAudio: hasAudioInput,
        inputAudioBitrateKbps: metadata?.audioStreams?.[0]?.bitrateKbps
      });

      const passLogPrefix = tempManager.createTempFilePath('svc_passlog');
      this.activePassLogPrefix = passLogPrefix;

      logger.info('Starting Two-Pass Target Size Compression', {
        targetSizeBytes,
        formattedTarget: formatBytes(targetSizeBytes),
        videoBitrateKbps: bitrateCalc.videoBitrateKbps,
        audioBitrateKbps: bitrateCalc.audioBitrateKbps,
        codec: vCodec
      });

      // --- PASS 1: Analysis ---
      const pass1Args: string[] = ['-nostdin', '-y', '-i', inputPath];
      pass1Args.push('-c:v', vCodec, '-b:v', `${bitrateCalc.videoBitrateKbps}k`);
      pass1Args.push('-pass', '1', '-passlogfile', passLogPrefix);

      if (settings.resolution !== 'original' && resolutionScaleMap[settings.resolution]) {
        pass1Args.push('-vf', resolutionScaleMap[settings.resolution]!);
      }
      if (settings.removeMetadata) {
        pass1Args.push('-map_metadata', '-1', '-map_chapters', '-1');
      }
      pass1Args.push('-map', '0:v:0', '-an');
      pass1Args.push('-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null');

      const pass1Result = await this.runFfmpegProcess(ffmpegPath, pass1Args, durationSeconds, (p) => {
        onProgress({
          ...p,
          percent: Math.min(45, Math.round(p.percent * 0.45))
        });
      });

      if (this.isCancelling) {
        await this.cleanupPassLogs(passLogPrefix);
        this.activePassLogPrefix = null;
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            userMessage: 'Video compression was cancelled by the user.'
          }
        };
      }

      if (pass1Result.code !== 0) {
        await this.cleanupPassLogs(passLogPrefix);
        this.activePassLogPrefix = null;
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        const classified = this.classifyStderrError(pass1Result.stderr);
        logger.warn('Pass 1 analysis failed', classified);
        return {
          success: false,
          error: classified
        };
      }

      // --- PASS 2: Final Encoding ---
      const pass2Args: string[] = ['-nostdin', '-y', '-i', inputPath];
      pass2Args.push('-c:v', vCodec, '-b:v', `${bitrateCalc.videoBitrateKbps}k`);
      pass2Args.push('-pass', '2', '-passlogfile', passLogPrefix, '-pix_fmt', 'yuv420p');

      if (settings.resolution !== 'original' && resolutionScaleMap[settings.resolution]) {
        pass2Args.push('-vf', resolutionScaleMap[settings.resolution]!);
      }
      if (settings.removeMetadata) {
        pass2Args.push('-map_metadata', '-1', '-map_chapters', '-1');
      }
      pass2Args.push('-map', '0:v:0');

      if (settings.audioCodec === 'none' || !hasAudioInput) {
        pass2Args.push('-an');
      } else {
        pass2Args.push('-map', '0:a:0?');
        if (settings.audioCodec === 'copy') {
          pass2Args.push('-c:a', 'copy');
        } else {
          pass2Args.push('-c:a', 'aac', '-b:a', `${bitrateCalc.audioBitrateKbps}k`);
        }
      }

      pass2Args.push('-video_track_timescale', '90000');
      pass2Args.push('-movflags', '+faststart');
      pass2Args.push(tempOutputPath);

      const pass2Result = await this.runFfmpegProcess(ffmpegPath, pass2Args, durationSeconds, (p) => {
        onProgress({
          ...p,
          percent: Math.min(100, 45 + Math.round(p.percent * 0.55))
        });
      });

      // Always clean up pass log files immediately
      await this.cleanupPassLogs(passLogPrefix);
      this.activePassLogPrefix = null;

      if (this.isCancelling) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            userMessage: 'Video compression was cancelled by the user.'
          }
        };
      }

      if (pass2Result.code !== 0) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        const classified = this.classifyStderrError(pass2Result.stderr);
        logger.warn('Pass 2 encoding failed', classified);
        return {
          success: false,
          error: classified
        };
      }
    } else {
      // =======================================================================
      // MODES: AUTOMATIC, HIGH, MEDIUM, LOW (SINGLE-PASS ENCODING)
      // =======================================================================
      const crfMap: Record<string, string> = {
        auto: '24',
        high: isH265 ? '22' : '20',
        medium: isH265 ? '26' : '24',
        low: isH265 ? '30' : '28'
      };

      const presetMap: Record<string, string> = {
        auto: 'medium',
        high: isH265 ? 'medium' : 'slow',
        medium: 'medium',
        low: 'fast'
      };

      const audioBitrateMap: Record<string, string> = {
        auto: '128k',
        high: '192k',
        medium: '128k',
        low: '96k'
      };

      const args: string[] = ['-nostdin', '-y', '-i', inputPath];
      args.push('-c:v', vCodec, '-pix_fmt', 'yuv420p');
      args.push('-crf', crfMap[settings.quality] ?? '24');
      args.push('-preset', presetMap[settings.quality] ?? 'medium');

      if (settings.resolution !== 'original' && resolutionScaleMap[settings.resolution]) {
        args.push('-vf', resolutionScaleMap[settings.resolution]!);
      }

      if (settings.removeMetadata) {
        args.push('-map_metadata', '-1', '-map_chapters', '-1');
      }

      args.push('-map', '0:v:0');

      if (settings.audioCodec === 'none' || !hasAudioInput) {
        args.push('-an');
      } else {
        args.push('-map', '0:a:0?');
        if (settings.audioCodec === 'copy') {
          args.push('-c:a', 'copy');
        } else {
          args.push('-c:a', 'aac', '-b:a', audioBitrateMap[settings.quality] ?? '128k');
        }
      }

      args.push('-video_track_timescale', '90000');
      args.push('-movflags', '+faststart');
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

      const singleResult = await this.runFfmpegProcess(ffmpegPath, args, durationSeconds, onProgress);

      if (this.isCancelling) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            userMessage: 'Video compression was cancelled by the user.'
          }
        };
      }

      if (singleResult.code !== 0) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        const classified = this.classifyStderrError(singleResult.stderr);
        logger.warn('Single-pass compression failed', classified);
        return {
          success: false,
          error: classified
        };
      }
    }

    // =========================================================================
    // POST-COMPRESSION VALIDATION & ATOMIC MOVE
    // =========================================================================
    try {
      this.activeProcess = null;
      this.activeTempPath = null;

      if (!fs.existsSync(tempOutputPath)) {
        throw new Error('Temporary output file missing upon completion.');
      }

      const outStat = await fs.promises.stat(tempOutputPath);
      if (outStat.size === 0) {
        await tempManager.cleanupFile(tempOutputPath);
        throw new Error('Output file is 0 bytes.');
      }

      // Lightweight ffprobe post-transcode validation
      const validation = await this.validateCompressedOutput(tempOutputPath, settings, hasAudioInput);
      if (!validation.valid) {
        await tempManager.cleanupFile(tempOutputPath);
        logger.warn('Output file validation failed', validation.reason);
        return {
          success: false,
          error: {
            code: 'OUTPUT_VALIDATION_FAILED',
            userMessage: validation.reason || 'Compressed video failed validation.'
          }
        };
      }

      // Generate final destination path
      const finalDestPath = generateSafeDestinationPath(inputPath, settings.customOutputDir);

      // Atomic move
      await atomicMove(tempOutputPath, finalDestPath);

      const reductionBytes = inputStat.size - outStat.size;
      const reductionPercentage = Math.round(((reductionBytes / inputStat.size) * 100) * 10) / 10;

      logger.info('Compression completed successfully', finalDestPath);

      return {
        success: true,
        result: {
          success: true,
          outputPath: finalDestPath,
          outputFileName: path.basename(finalDestPath),
          originalSizeBytes: inputStat.size,
          compressedSizeBytes: outStat.size,
          reductionPercentage,
          durationSeconds,
          targetSizeBytes: targetSizeForRecord
        }
      };
    } catch (postErr) {
      logger.error('Post-compression processing error', postErr);
      await tempManager.cleanupFile(tempOutputPath);
      return {
        success: false,
        error: {
          code: 'COMPRESSION_FAILED',
          userMessage: 'Failed to finalize output file.'
        }
      };
    }
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
