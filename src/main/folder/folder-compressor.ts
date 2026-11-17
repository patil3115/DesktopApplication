import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { formatBytes } from '../../common/formatters';
import { jobSupervisor } from '../ffmpeg/compressor';
import { probeVideoFile } from '../ffmpeg/probe';
import { imageJobSupervisor } from '../image/image-compressor';
import { probeImageFile } from '../image/image-probe';
import { validateFolderCompressionPaths, validateSourceDirectoryPath } from '../fs/path-sanitizer';
import { generateFolderSafeDestinationPath, atomicMove } from '../fs/atomic-move';
import { tempManager } from '../fs/temp-manager';
import {
  validateCompressionSettings,
  validateImageCompressionSettings
} from '../../common/validators';
import {
  ScannedFolderItem,
  FolderScanResult,
  FolderItemProgress,
  FolderProcessedItem,
  FolderItemStatus,
  FolderCompressionSummary,
  CompressionSettings,
  ImageCompressionSettings,
  StructuredError
} from '../../common/types';

const SUPPORTED_VIDEO_EXTS: ReadonlySet<string> = new Set([
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.webm',
  '.flv',
  '.wmv',
  '.m4v'
]);

const SUPPORTED_IMAGE_EXTS: ReadonlySet<string> = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp'
]);

/**
 * Recursively scans a directory for supported video and image files.
 * Ignores hidden files, system directories, and standard dependency folders.
 */
export async function scanFolderForMedia(sourceDir: string): Promise<FolderScanResult> {
  const resolvedSource = validateSourceDirectoryPath(sourceDir);
  const items: ScannedFolderItem[] = [];
  let totalSizeBytes = 0;
  let videoCount = 0;
  let imageCount = 0;

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`[FolderScan] Unable to read directory ${currentDir}`, err);
      return;
    }

    // Deterministic sort for consistent scan results
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
      // Ignore hidden files and system directories
      if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (
          lowerName === 'node_modules' ||
          lowerName === 'dist' ||
          lowerName === 'dist-electron' ||
          lowerName === 'dist-renderer' ||
          lowerName === '$recycle.bin'
        ) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let mediaType: 'video' | 'image' | null = null;
        if (SUPPORTED_VIDEO_EXTS.has(ext)) {
          mediaType = 'video';
        } else if (SUPPORTED_IMAGE_EXTS.has(ext)) {
          mediaType = 'image';
        }

        if (mediaType) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > 0) {
              const relPath = path.relative(resolvedSource, fullPath);
              const relDir = path.dirname(relPath);
              totalSizeBytes += stat.size;
              if (mediaType === 'video') videoCount++;
              else imageCount++;

              items.push({
                id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                absolutePath: fullPath,
                relativePath: relPath,
                relativeDir: relDir === '.' ? '' : relDir,
                fileName: entry.name,
                type: mediaType,
                fileSizeBytes: stat.size,
                formattedSize: formatBytes(stat.size)
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  await walk(resolvedSource);

  const parentDir = path.dirname(resolvedSource);
  const folderName = path.basename(resolvedSource);
  const defaultOutputDir = path.join(parentDir, `${folderName}_Compressed`);

  return {
    sourceRootDir: resolvedSource,
    defaultOutputDir,
    totalFiles: items.length,
    videoCount,
    imageCount,
    totalSizeBytes,
    formattedTotalSize: formatBytes(totalSizeBytes),
    items
  };
}

export class FolderCompressionSupervisor {
  private active = false;
  private isCancelling = false;

  public isRunning(): boolean {
    return this.active;
  }

  public async cancel(): Promise<boolean> {
    if (!this.active) return false;
    this.isCancelling = true;
    logger.info('[FolderCompressor] Cancellation requested by user');
    try {
      await jobSupervisor.cancel();
      await imageJobSupervisor.cancel();
    } catch (err) {
      logger.warn('[FolderCompressor] Error propagating cancel to child supervisors', err);
    }
    return true;
  }

  public async startFolderCompression(
    params: {
      sourceDir: string;
      outputDir: string;
      videoSettings?: unknown;
      imageSettings?: unknown;
    },
    onProgress?: (progress: FolderItemProgress) => void
  ): Promise<FolderCompressionSummary> {
    if (this.active) {
      return {
        success: false,
        isCancelled: false,
        sourceRootDir: params.sourceDir,
        outputRootDir: params.outputDir,
        totalItems: 0,
        completedCount: 0,
        failedCount: 0,
        originalTotalBytes: 0,
        compressedTotalBytes: 0,
        overallReductionPercentage: 0,
        items: [],
        error: {
          code: 'ALREADY_RUNNING',
          userMessage: 'A folder compression job is already running.'
        }
      };
    }

    this.active = true;
    this.isCancelling = false;

    try {
      const { sourceDir, outputDir } = validateFolderCompressionPaths(params.sourceDir, params.outputDir);

      const videoSettings: CompressionSettings = params.videoSettings
        ? validateCompressionSettings(params.videoSettings)
        : {
            quality: 'auto',
            resolution: 'original',
            codec: 'h264',
            audioCodec: 'aac',
            removeMetadata: true,
            customOutputDir: null,
            targetSizeBytes: null,
            targetPercent: 50
          };

      const imageSettings: ImageCompressionSettings = params.imageSettings
        ? validateImageCompressionSettings(params.imageSettings)
        : {
            quality: 'auto',
            outputFormat: 'original',
            targetSizeBytes: null,
            targetPercent: 50,
            resize: {
              enabled: false,
              mode: 'percentage',
              percentage: 50,
              lockAspectRatio: true
            },
            removeMetadata: true,
            customOutputDir: null
          };

      logger.info('[FolderCompressor] Scanning folder for media items', sourceDir);
      const scanResult = await scanFolderForMedia(sourceDir);

      if (scanResult.items.length === 0) {
        return {
          success: false,
          isCancelled: false,
          sourceRootDir: sourceDir,
          outputRootDir: outputDir,
          totalItems: 0,
          completedCount: 0,
          failedCount: 0,
          originalTotalBytes: 0,
          compressedTotalBytes: 0,
          overallReductionPercentage: 0,
          items: [],
          error: {
            code: 'NO_MEDIA_FOUND',
            userMessage: 'No supported video or image files were found in the selected folder.'
          }
        };
      }

      // Ensure output root directory exists
      if (!fs.existsSync(outputDir)) {
        await fs.promises.mkdir(outputDir, { recursive: true });
      }

      const claimedPaths = new Set<string>();
      const processedItems: FolderProcessedItem[] = [];
      let completedCount = 0;
      let failedCount = 0;
      let compressedTotalBytes = 0;
      let originalTotalBytes = 0;
      let wasCancelled = false;

      for (let i = 0; i < scanResult.items.length; i++) {
        if (this.isCancelling) {
          wasCancelled = true;
          for (let j = i; j < scanResult.items.length; j++) {
            const remItem = scanResult.items[j]!;
            processedItems.push({
              item: remItem,
              success: false,
              originalSizeBytes: remItem.fileSizeBytes,
              error: {
                code: 'CANCELLED',
                userMessage: 'Folder compression cancelled by user.'
              }
            });
          }
          break;
        }

        const item = scanResult.items[i]!;
        originalTotalBytes += item.fileSizeBytes;

        if (onProgress) {
          onProgress({
            currentItemIndex: i + 1,
            totalItems: scanResult.items.length,
            currentRelativePath: item.relativePath,
            currentType: item.type,
            overallPercent: Math.round(((i) / scanResult.items.length) * 100),
            completedCount,
            failedCount
          });
        }

        try {
          if (item.type === 'video') {
            const probeRes = await probeVideoFile(item.absolutePath);
            if (!probeRes.success) {
              failedCount++;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: probeRes.error
              });
              continue;
            }

            const destPath = generateFolderSafeDestinationPath(
              item.absolutePath,
              sourceDir,
              outputDir,
              undefined,
              claimedPaths
            );

            // Mandatory Output-Size Safeguard:
            // Encode video to an isolated temporary file first
            const tempVideoOutput = tempManager.createTempFilePath(path.extname(destPath) || '.mp4');

            const effectiveVideoSettings: CompressionSettings = {
              ...videoSettings,
              customOutputPath: tempVideoOutput
            };

            const compressRes = await jobSupervisor.startCompression(
              item.absolutePath,
              probeRes.metadata.durationSeconds,
              effectiveVideoSettings,
              (vProg) => {
                if (onProgress) {
                  onProgress({
                    currentItemIndex: i + 1,
                    totalItems: scanResult.items.length,
                    currentRelativePath: item.relativePath,
                    currentType: 'video',
                    overallPercent: Math.round(((i + vProg.percent / 100) / scanResult.items.length) * 100),
                    completedCount,
                    failedCount,
                    currentItemPercent: vProg.percent
                  });
                }
              },
              probeRes.metadata.hasAudio,
              probeRes.metadata
            );

            if (this.isCancelling) {
              await tempManager.cleanupFile(tempVideoOutput);
              wasCancelled = true;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: {
                  code: 'CANCELLED',
                  userMessage: 'Compression cancelled.'
                }
              });
              break;
            }

            if (compressRes.success && compressRes.result) {
              if (!fs.existsSync(tempVideoOutput)) {
                throw new Error('Temporary encoded video file missing upon completion.');
              }

              // Verify encoded output is valid using FFprobe
              const verifyProbe = await probeVideoFile(tempVideoOutput);
              if (!verifyProbe.success || !verifyProbe.metadata) {
                await tempManager.cleanupFile(tempVideoOutput);
                throw new Error('Compressed video failed verification probe.');
              }

              const encodedStat = await fs.promises.stat(tempVideoOutput);
              const originalSize = item.fileSizeBytes;
              const encodedSize = encodedStat.size;

              if (encodedSize < originalSize) {
                // Size reduced: keep compressed output and move to destination
                await atomicMove(tempVideoOutput, destPath);
                const reductionBytes = originalSize - encodedSize;
                const reductionPercentage = Math.round(((reductionBytes / originalSize) * 100) * 10) / 10;

                completedCount++;
                compressedTotalBytes += encodedSize;
                processedItems.push({
                  item,
                  success: true,
                  status: 'compressed',
                  outputPath: destPath,
                  outputFileName: path.basename(destPath),
                  originalSizeBytes: originalSize,
                  compressedSizeBytes: encodedSize,
                  reductionPercentage
                });
                logger.info(`[FolderCompressor] Video reduced from ${formatBytes(originalSize)} to ${formatBytes(encodedSize)} (-${reductionPercentage}%)`, destPath);
              } else {
                // Safeguard triggered: output is equal or larger!
                // 1. Delete the larger temporary encoded output safely
                await tempManager.cleanupFile(tempVideoOutput);

                // 2. Ensure destination directory exists
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

                // 3. Copy original file unchanged to mirrored output location
                await fs.promises.copyFile(item.absolutePath, destPath);

                const copiedStat = await fs.promises.stat(destPath);
                completedCount++;
                compressedTotalBytes += copiedStat.size;
                processedItems.push({
                  item,
                  success: true,
                  status: 'original_retained',
                  outputPath: destPath,
                  outputFileName: path.basename(destPath),
                  originalSizeBytes: originalSize,
                  compressedSizeBytes: copiedStat.size,
                  reductionPercentage: 0
                });
                logger.info(`[FolderCompressor] Output was larger or equal (${formatBytes(encodedSize)} >= ${formatBytes(originalSize)}). Safeguard triggered: Original retained — no reduction achieved.`, destPath);
              }
            } else {
              await tempManager.cleanupFile(tempVideoOutput);
              failedCount++;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: compressRes.error || {
                  code: 'COMPRESSION_FAILED',
                  userMessage: 'Video compression failed.'
                }
              });
            }
          } else {
            // Image item
            const probeRes = await probeImageFile(item.absolutePath);
            if (!probeRes.success || !probeRes.metadata) {
              failedCount++;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: probeRes.error || {
                  code: 'PROBE_FAILED',
                  userMessage: 'Failed to probe image file metadata.'
                }
              });
              continue;
            }

            const destPath = generateFolderSafeDestinationPath(
              item.absolutePath,
              sourceDir,
              outputDir,
              { outputFormat: imageSettings.outputFormat },
              claimedPaths
            );

            const isSameFormat =
              !imageSettings.outputFormat ||
              imageSettings.outputFormat === 'original' ||
              imageSettings.outputFormat.toLowerCase() === path.extname(item.absolutePath).toLowerCase().replace(/^\./, '');

            // Encode to isolated temporary file
            const tempImageOutput = tempManager.createTempFilePath(path.extname(destPath) || '.jpg');

            const effectiveImageSettings: ImageCompressionSettings = {
              ...imageSettings,
              customOutputPath: tempImageOutput
            };

            const imageRes = await imageJobSupervisor.compressImage(
              item.absolutePath,
              probeRes.metadata,
              effectiveImageSettings
            );

            if (this.isCancelling) {
              await tempManager.cleanupFile(tempImageOutput);
              wasCancelled = true;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: {
                  code: 'CANCELLED',
                  userMessage: 'Compression cancelled.'
                }
              });
              break;
            }

            if (imageRes.success && imageRes.result) {
              if (!fs.existsSync(tempImageOutput)) {
                throw new Error('Temporary encoded image file missing upon completion.');
              }

              const encodedStat = await fs.promises.stat(tempImageOutput);
              const originalSize = item.fileSizeBytes;
              const encodedSize = encodedStat.size;

              if (encodedSize < originalSize || !isSameFormat) {
                await atomicMove(tempImageOutput, destPath);
                const reductionBytes = originalSize > encodedSize ? originalSize - encodedSize : 0;
                const reductionPercentage = originalSize > 0
                  ? Math.round(((reductionBytes / originalSize) * 100) * 10) / 10
                  : 0;

                const itemStatus: FolderItemStatus = encodedSize < originalSize ? 'compressed' : 'no_reduction';

                completedCount++;
                compressedTotalBytes += encodedSize;
                processedItems.push({
                  item,
                  success: true,
                  status: itemStatus,
                  outputPath: destPath,
                  outputFileName: path.basename(destPath),
                  originalSizeBytes: originalSize,
                  compressedSizeBytes: encodedSize,
                  reductionPercentage
                });
              } else {
                // Same format and output was larger or equal: safeguard!
                await tempManager.cleanupFile(tempImageOutput);
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                await fs.promises.copyFile(item.absolutePath, destPath);

                const copiedStat = await fs.promises.stat(destPath);
                completedCount++;
                compressedTotalBytes += copiedStat.size;
                processedItems.push({
                  item,
                  success: true,
                  status: 'original_retained',
                  outputPath: destPath,
                  outputFileName: path.basename(destPath),
                  originalSizeBytes: originalSize,
                  compressedSizeBytes: copiedStat.size,
                  reductionPercentage: 0
                });
              }
            } else {
              await tempManager.cleanupFile(tempImageOutput);
              failedCount++;
              processedItems.push({
                item,
                success: false,
                status: 'failed',
                originalSizeBytes: item.fileSizeBytes,
                error: imageRes.error || {
                  code: 'COMPRESSION_FAILED',
                  userMessage: 'Image compression failed.'
                }
              });
            }
          }
        } catch (itemErr) {
          logger.error(`[FolderCompressor] Unexpected error on item ${item.relativePath}`, itemErr);
          failedCount++;
          processedItems.push({
            item,
            success: false,
            status: 'failed',
            originalSizeBytes: item.fileSizeBytes,
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: itemErr instanceof Error ? itemErr.message : 'Processing error.'
            }
          });
        }
      }

      if (onProgress) {
        onProgress({
          currentItemIndex: scanResult.items.length,
          totalItems: scanResult.items.length,
          currentRelativePath: 'Complete',
          currentType: 'video',
          overallPercent: 100,
          completedCount,
          failedCount
        });
      }

      const totalReductionBytes = originalTotalBytes > compressedTotalBytes ? originalTotalBytes - compressedTotalBytes : 0;
      const overallReductionPercentage = originalTotalBytes > 0
        ? Math.round(((totalReductionBytes / originalTotalBytes) * 100) * 10) / 10
        : 0;

      return {
        success: completedCount > 0,
        isCancelled: wasCancelled,
        sourceRootDir: sourceDir,
        outputRootDir: outputDir,
        totalItems: scanResult.items.length,
        completedCount,
        failedCount,
        originalTotalBytes,
        compressedTotalBytes,
        overallReductionPercentage,
        items: processedItems
      };
    } catch (err) {
      logger.error('[FolderCompressor] Unhandled error during folder compression', err);
      const structuredErr: StructuredError = {
        code: 'COMPRESSION_FAILED',
        userMessage: err instanceof Error ? err.message : 'Folder compression encountered a fatal error.'
      };
      return {
        success: false,
        isCancelled: false,
        sourceRootDir: params.sourceDir,
        outputRootDir: params.outputDir,
        totalItems: 0,
        completedCount: 0,
        failedCount: 0,
        originalTotalBytes: 0,
        compressedTotalBytes: 0,
        overallReductionPercentage: 0,
        items: [],
        error: structuredErr
      };
    } finally {
      this.active = false;
      this.isCancelling = false;
    }
  }
}

export const folderJobSupervisor = new FolderCompressionSupervisor();
