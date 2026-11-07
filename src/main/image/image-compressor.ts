import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  ImageCompressionSettings,
  ImageCompressionResult,
  ImageMetadata,
  StructuredError
} from '../../common/types';
import {
  calculateMinImageTargetSizeBytes,
  calculateImageReductionPercentage
} from '../../common/image-target-size';
import { binaryResolver } from '../ffmpeg/binary-resolver';
import { tempManager } from '../fs/temp-manager';
import { atomicMove } from '../fs/atomic-move';
import { verifySufficientDiskSpace } from '../utils/disk-space';
import { formatBytes } from '../../common/formatters';
import { logger } from '../utils/logger';
import { probeImageFile } from './image-probe';

/**
 * Generates collision-free destination path for compressed images.
 * E.g.: "photo_compressed.jpg", "photo_compressed (1).jpg"
 */
export function generateSafeImageDestinationPath(
  inputPath: string,
  outputExtension: string,
  customOutputDir?: string | null
): string {
  const targetDir = customOutputDir ? path.resolve(customOutputDir) : path.dirname(inputPath);
  const parsed = path.parse(inputPath);
  const ext = outputExtension.startsWith('.') ? outputExtension : `.${outputExtension}`;
  const baseName = `${parsed.name}_compressed`;

  let candidate = path.join(targetDir, `${baseName}${ext}`);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(targetDir, `${baseName} (${counter})${ext}`);
    counter++;
    if (counter > 1000) {
      const randSuffix = Math.random().toString(36).substring(2, 7);
      candidate = path.join(targetDir, `${baseName}_${randSuffix}${ext}`);
      break;
    }
  }

  return candidate;
}

export class ImageJobSupervisor {
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

    logger.info('Received cancellation request for active image compression job');
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
      logger.warn('Failed to kill image compression process tree', err);
    } finally {
      this.activeProcess = null;
      this.activeTempPath = null;
    }

    if (tempToClean) {
      await tempManager.cleanupFile(tempToClean);
    }

    return true;
  }

  private runProcess(
    ffmpegPath: string,
    args: string[]
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
        stderrBuffer += chunk.toString();
        if (stderrBuffer.length > 10000) {
          stderrBuffer = stderrBuffer.slice(-5000);
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

  /**
   * Builds the FFmpeg argument list for encoding an image given parameters.
   */
  private buildFfmpegArgs(params: {
    inputPath: string;
    outputPath: string;
    effectiveFormat: 'jpg' | 'png' | 'webp';
    hasAlpha: boolean;
    removeMetadata: boolean;
    resizeFilter?: string;
    jpgQscale?: number;
    webpQuality?: number;
    webpLossless?: boolean;
    pngCompressionLevel?: number;
  }): string[] {
    const args: string[] = ['-nostdin', '-y', '-i', params.inputPath];

    // Build filter chain
    const isJpg = params.effectiveFormat === 'jpg';
    const needsWhiteBg = isJpg && params.hasAlpha;

    if (needsWhiteBg) {
      // Composite over white background to avoid black background on transparent images
      let complex = '[0:v]format=rgba,split=2[fg][bg];[bg]drawbox=c=white:t=fill[wbg];[wbg][fg]overlay=format=auto';
      if (params.resizeFilter) {
        complex += `,${params.resizeFilter}`;
      }
      args.push('-filter_complex', complex);
    } else if (params.resizeFilter) {
      args.push('-vf', params.resizeFilter);
    }

    // Codec-specific parameters
    switch (params.effectiveFormat) {
      case 'jpg': {
        const qscale = params.jpgQscale ?? 4;
        args.push('-c:v', 'mjpeg', '-q:v', qscale.toString());
        break;
      }
      case 'webp': {
        args.push('-c:v', 'libwebp');
        if (params.webpLossless) {
          args.push('-lossless', '1', '-compression_level', '5');
        } else {
          const quality = params.webpQuality ?? 80;
          args.push('-quality', quality.toString(), '-compression_level', '4');
        }
        break;
      }
      case 'png': {
        const level = params.pngCompressionLevel ?? 9;
        args.push('-c:v', 'png', '-compression_level', level.toString(), '-pred', 'mixed');
        break;
      }
    }

    // Single frame
    args.push('-frames:v', '1');

    // Metadata stripping
    if (params.removeMetadata) {
      args.push('-map_metadata', '-1');
    }

    args.push(params.outputPath);
    return args;
  }

  public async startCompression(
    inputPath: string,
    settings: ImageCompressionSettings,
    metadata?: ImageMetadata
  ): Promise<{ success: boolean; result?: ImageCompressionResult; error?: StructuredError }> {
    let meta = metadata;
    if (!meta) {
      const probe = await probeImageFile(inputPath);
      if (!probe.success || !probe.metadata) {
        return {
          success: false,
          error: probe.error || {
            code: 'PROBE_FAILED',
            userMessage: 'Failed to inspect image file metadata.'
          }
        };
      }
      meta = probe.metadata;
    }
    return this.compressImage(inputPath, meta, settings);
  }

  public async compressImage(
    inputPath: string,
    metadata: ImageMetadata,
    settings: ImageCompressionSettings
  ): Promise<{ success: boolean; result?: ImageCompressionResult; error?: StructuredError }> {
    if (this.isRunning()) {
      return {
        success: false,
        error: {
          code: 'ALREADY_RUNNING',
          userMessage: 'An image compression task is currently running. Please wait or cancel.'
        }
      };
    }

    let ffmpegPath: string;
    try {
      ffmpegPath = binaryResolver.getFfmpegPath();
    } catch {
      return {
        success: false,
        error: {
          code: 'FFMPEG_NOT_FOUND',
          userMessage: 'Bundled media engine binary could not be located.'
        }
      };
    }

    const inputStat = await fs.promises.stat(inputPath);
    const targetDir = settings.customOutputDir || path.dirname(inputPath);

    // Verify disk space
    const spaceCheck = await verifySufficientDiskSpace(targetDir, inputStat.size);
    if (!spaceCheck.sufficient) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_DISK_SPACE',
          userMessage: 'Insufficient disk space for compressed image output.'
        }
      };
    }

    this.isCancelling = false;

    // Resolve output format
    let effectiveFormat: 'jpg' | 'png' | 'webp';
    if (settings.outputFormat === 'original') {
      const origExt = metadata.format.toLowerCase();
      if (origExt === 'png') effectiveFormat = 'png';
      else if (origExt === 'webp') effectiveFormat = 'webp';
      else effectiveFormat = 'jpg'; // Handles jpg, jpeg, bmp
    } else {
      effectiveFormat = settings.outputFormat;
    }

    // Build resize filter string if enabled
    let resizeFilter: string | undefined = undefined;
    if (settings.resize?.enabled) {
      if (settings.resize.mode === 'percentage' && settings.resize.percentage) {
        const factor = Math.min(500, Math.max(1, settings.resize.percentage)) / 100;
        resizeFilter = `scale=round(iw*${factor}):round(ih*${factor})`;
      } else if (settings.resize.mode === 'dimensions' || (settings.resize.mode as any) === 'custom') {
        const anyResize = settings.resize as any;
        const w = settings.resize.width || anyResize.customWidth;
        const h = settings.resize.height || anyResize.customHeight;
        if (w && h) {
          if (settings.resize.lockAspectRatio) {
            resizeFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
          } else {
            resizeFilter = `scale=${w}:${h}`;
          }
        } else if (w) {
          resizeFilter = `scale=${w}:-1`;
        } else if (h) {
          resizeFilter = `scale=-1:${h}`;
        }
      }
    }

    const outExt = effectiveFormat === 'jpg' ? '.jpg' : `.${effectiveFormat}`;
    const tempOutputPath = tempManager.createTempFilePath(outExt);
    this.activeTempPath = tempOutputPath;

    let targetSizeForRecord: number | undefined = undefined;
    let customNote: string | undefined = undefined;

    // =========================================================================
    // MODE 5: CUSTOM TARGET SIZE (BOUNDED ITERATIVE SEARCH)
    // =========================================================================
    if (settings.quality === 'custom') {
      let targetBytes = settings.targetSizeBytes;
      if ((!targetBytes || targetBytes <= 0) && settings.targetPercent) {
        targetBytes = Math.round(inputStat.size * (settings.targetPercent / 100));
      }
      if (!targetBytes || targetBytes <= 0) {
        targetBytes = Math.round(inputStat.size * 0.5);
      }
      targetSizeForRecord = targetBytes;

      const minFeasibleBytes = calculateMinImageTargetSizeBytes({
        width: metadata.width,
        height: metadata.height,
        format: effectiveFormat,
        hasAlpha: metadata.hasAlpha,
        originalSizeBytes: inputStat.size
      });

      if (targetBytes < minFeasibleBytes) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            userMessage: `Requested target size (${formatBytes(targetBytes)}) is below the minimum technically feasible size (${formatBytes(minFeasibleBytes)}) for this image. Please increase target size.`
          }
        };
      }

      logger.info('Starting bounded iterative target size encoding for image', {
        input: metadata.fileName,
        targetBytes,
        format: effectiveFormat
      });

      if (effectiveFormat === 'png') {
        // PNG is lossless; encode with maximum compression
        const args = this.buildFfmpegArgs({
          inputPath,
          outputPath: tempOutputPath,
          effectiveFormat: 'png',
          hasAlpha: metadata.hasAlpha,
          removeMetadata: settings.removeMetadata,
          resizeFilter,
          pngCompressionLevel: 9
        });

        const execResult = await this.runProcess(ffmpegPath, args);
        if (execResult.code !== 0) {
          await tempManager.cleanupFile(tempOutputPath);
          this.activeTempPath = null;
          return {
            success: false,
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: 'Image compression failed.'
            }
          };
        }

        const outStat = await fs.promises.stat(tempOutputPath);
        if (outStat.size > targetBytes) {
          customNote = 'Lossless PNG reached its maximum compression level. For smaller sizes, choose WebP or JPG, or enable image resizing.';
        }
      } else if (effectiveFormat === 'webp') {
        // Binary search on WebP quality [15, 95] across max 5 iterations
        let lowQuality = 15;
        let highQuality = 95;
        let bestDiff = Infinity;
        let bestCandidatePath = tempOutputPath;

        for (let iter = 0; iter < 5; iter++) {
          if (this.isCancelling) break;

          const testQuality = Math.round((lowQuality + highQuality) / 2);
          const iterTemp = tempManager.createTempFilePath('.webp');
          this.activeTempPath = iterTemp;

          const args = this.buildFfmpegArgs({
            inputPath,
            outputPath: iterTemp,
            effectiveFormat: 'webp',
            hasAlpha: metadata.hasAlpha,
            removeMetadata: settings.removeMetadata,
            resizeFilter,
            webpQuality: testQuality
          });

          const res = await this.runProcess(ffmpegPath, args);
          if (res.code === 0 && fs.existsSync(iterTemp)) {
            const stat = await fs.promises.stat(iterTemp);
            const currentSize = stat.size;
            const diff = Math.abs(currentSize - targetBytes);

            if (diff < bestDiff) {
              bestDiff = diff;
              if (bestCandidatePath !== tempOutputPath && fs.existsSync(bestCandidatePath)) {
                await tempManager.cleanupFile(bestCandidatePath);
              }
              bestCandidatePath = iterTemp;
            } else {
              await tempManager.cleanupFile(iterTemp);
            }

            // If within 5% of target, stop
            if (currentSize <= targetBytes && (targetBytes - currentSize) < targetBytes * 0.05) {
              break;
            }

            if (currentSize > targetBytes) {
              highQuality = testQuality - 1;
            } else {
              lowQuality = testQuality + 1;
            }

            if (lowQuality > highQuality) break;
          } else {
            await tempManager.cleanupFile(iterTemp);
            break;
          }
        }

        this.activeTempPath = bestCandidatePath;
      } else {
        // JPG: Binary search on MJPEG qscale [2 (high), 31 (low)] max 5 iterations
        let highQscale = 31; // lowest quality
        let lowQscale = 2;   // highest quality
        let bestCandidatePath = tempOutputPath;
        let bestDiff = Infinity;

        for (let iter = 0; iter < 5; iter++) {
          if (this.isCancelling) break;

          const testQscale = Math.round((lowQscale + highQscale) / 2);
          const iterTemp = tempManager.createTempFilePath('.jpg');
          this.activeTempPath = iterTemp;

          const args = this.buildFfmpegArgs({
            inputPath,
            outputPath: iterTemp,
            effectiveFormat: 'jpg',
            hasAlpha: metadata.hasAlpha,
            removeMetadata: settings.removeMetadata,
            resizeFilter,
            jpgQscale: testQscale
          });

          const res = await this.runProcess(ffmpegPath, args);
          if (res.code === 0 && fs.existsSync(iterTemp)) {
            const stat = await fs.promises.stat(iterTemp);
            const currentSize = stat.size;
            const diff = Math.abs(currentSize - targetBytes);

            if (diff < bestDiff) {
              bestDiff = diff;
              if (bestCandidatePath !== tempOutputPath && fs.existsSync(bestCandidatePath)) {
                await tempManager.cleanupFile(bestCandidatePath);
              }
              bestCandidatePath = iterTemp;
            } else {
              await tempManager.cleanupFile(iterTemp);
            }

            if (currentSize <= targetBytes && (targetBytes - currentSize) < targetBytes * 0.05) {
              break;
            }

            if (currentSize > targetBytes) {
              // Need lower file size -> higher qscale value in ffmpeg
              lowQscale = testQscale + 1;
            } else {
              highQscale = testQscale - 1;
            }

            if (lowQscale > highQscale) break;
          } else {
            await tempManager.cleanupFile(iterTemp);
            break;
          }
        }

        this.activeTempPath = bestCandidatePath;
      }
    } else {
      // =======================================================================
      // MODES 1-4: AUTOMATIC, HIGH, MEDIUM, LOW
      // =======================================================================
      let jpgQscale: number;
      let webpQuality: number;
      let webpLossless = false;
      let pngCompressionLevel = 9;

      switch (settings.quality) {
        case 'auto':
          jpgQscale = 4;
          webpQuality = 80;
          break;
        case 'high':
          jpgQscale = 2;
          webpQuality = 92;
          if (metadata.format === 'png' && effectiveFormat === 'webp') {
            webpLossless = true;
          }
          break;
        case 'medium':
          jpgQscale = 6;
          webpQuality = 75;
          break;
        case 'low':
          jpgQscale = 14;
          webpQuality = 50;
          break;
        default:
          jpgQscale = 4;
          webpQuality = 80;
          break;
      }

      const args = this.buildFfmpegArgs({
        inputPath,
        outputPath: tempOutputPath,
        effectiveFormat,
        hasAlpha: metadata.hasAlpha,
        removeMetadata: settings.removeMetadata,
        resizeFilter,
        jpgQscale,
        webpQuality,
        webpLossless,
        pngCompressionLevel
      });

      logger.info('Starting image transcode with controlled args', {
        format: effectiveFormat,
        quality: settings.quality
      });

      const execResult = await this.runProcess(ffmpegPath, args);

      if (this.isCancelling) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            userMessage: 'Image compression was cancelled by the user.'
          }
        };
      }

      if (execResult.code !== 0) {
        await tempManager.cleanupFile(tempOutputPath);
        this.activeTempPath = null;
        logger.warn('Image compression failed', execResult.stderr);
        return {
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: 'Image compression encountered an unexpected error.'
          }
        };
      }
    }

    // =========================================================================
    // POST-PROCESSING, PROBE & ATOMIC MOVE
    // =========================================================================
    const finalTempFile = this.activeTempPath;
    try {
      this.activeProcess = null;
      this.activeTempPath = null;

      if (!finalTempFile || !fs.existsSync(finalTempFile)) {
        throw new Error('Temporary compressed image file missing upon completion.');
      }

      const outStat = await fs.promises.stat(finalTempFile);
      if (outStat.size === 0) {
        await tempManager.cleanupFile(finalTempFile);
        throw new Error('Output image file is 0 bytes.');
      }

      // Probe output dimensions with ffprobe
      let outWidth = metadata.width;
      let outHeight = metadata.height;

      try {
        const ffprobePath = binaryResolver.getFfprobePath();
        const probeArgs = [
          '-v',
          'error',
          '-show_entries',
          'stream=width,height',
          '-of',
          'json',
          finalTempFile
        ];

        const probeOut = await new Promise<string>((res, rej) => {
          let s = '';
          const c = spawn(ffprobePath, probeArgs, {
            shell: false,
            windowsHide: true,
            env: { SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows', PATH: '' }
          });
          c.stdout.on('data', d => s += d.toString());
          c.on('close', code => code === 0 ? res(s) : rej(new Error('probe failed')));
          c.on('error', rej);
        });

        const parsed = JSON.parse(probeOut);
        if (parsed.streams && parsed.streams[0]) {
          outWidth = parseInt(parsed.streams[0].width, 10) || outWidth;
          outHeight = parseInt(parsed.streams[0].height, 10) || outHeight;
        }
      } catch {
        // Fallback to existing dimensions
      }

      // Generate collision-safe final destination
      const finalDestPath = generateSafeImageDestinationPath(
        inputPath,
        outExt,
        settings.customOutputDir
      );

      // Atomic move to destination
      await atomicMove(finalTempFile, finalDestPath);

      const reductionPercentage = calculateImageReductionPercentage(inputStat.size, outStat.size);

      logger.info('Image compression completed successfully', finalDestPath);

      return {
        success: true,
        result: {
          success: true,
          outputPath: finalDestPath,
          outputFileName: path.basename(finalDestPath),
          originalSizeBytes: inputStat.size,
          compressedSizeBytes: outStat.size,
          reductionPercentage,
          outputFormat: effectiveFormat.toUpperCase(),
          format: effectiveFormat.toLowerCase(),
          width: outWidth,
          height: outHeight,
          targetSizeBytes: targetSizeForRecord,
          note: customNote
        }
      };
    } catch (postErr) {
      logger.error('Post-compression image processing error', postErr);
      if (finalTempFile) {
        await tempManager.cleanupFile(finalTempFile);
      }
      return {
        success: false,
        error: {
          code: 'COMPRESSION_FAILED',
          userMessage: 'Failed to finalize compressed image file.'
        }
      };
    }
  }
}

export const imageJobSupervisor = new ImageJobSupervisor();
