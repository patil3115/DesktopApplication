import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from '../common/ipc-channels';
import {
  validateCompressionSettings,
  validateAudioExtractionSettings,
  validateImageCompressionSettings,
  validateSafePath
} from '../common/validators';
import {
  validateInputVideoPath,
  validateInputImagePath,
  validateOutputDirectoryPath
} from './fs/path-sanitizer';
import { probeVideoFile } from './ffmpeg/probe';
import { jobSupervisor } from './ffmpeg/compressor';
import { audioExtractorSupervisor } from './ffmpeg/audio-extractor';
import { probeImageFile } from './image/image-probe';
import { imageJobSupervisor } from './image/image-compressor';
import {
  VideoMetadata,
  StructuredError,
  FileSelectionResult,
  SelectedFileItem,
  ImageMetadata,
  ImageQueueItem,
  ImageSelectionResult
} from '../common/types';
import { logger } from './utils/logger';

interface ActiveFileState {
  filePath: string;
  metadata: VideoMetadata;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  let activeFile: ActiveFileState | null = null;
  const activeFiles = new Map<string, ActiveFileState>();

  // Shared file selection handler
  const handleSelectVideo = async (): Promise<FileSelectionResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Video File(s)',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Supported Video Formats',
            extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v']
          }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const fileItems: SelectedFileItem[] = [];

      for (const rawPath of result.filePaths) {
        if (!rawPath) continue;

        let validatedPath: string;
        try {
          validatedPath = validateInputVideoPath(rawPath);
        } catch (valErr) {
          logger.warn('File validation failed for ' + rawPath, valErr);
          fileItems.push({
            filePath: rawPath,
            error: {
              code: 'FILE_VALIDATION_FAILED',
              userMessage: valErr instanceof Error ? valErr.message : 'Invalid or inaccessible video file.'
            }
          });
          continue;
        }

        // Probe video metadata securely
        const probeResult = await probeVideoFile(validatedPath);
        if (!probeResult.success) {
          fileItems.push({
            filePath: validatedPath,
            error: probeResult.error
          });
        } else {
          const state: ActiveFileState = {
            filePath: validatedPath,
            metadata: probeResult.metadata
          };
          activeFiles.set(validatedPath, state);
          fileItems.push({
            filePath: validatedPath,
            metadata: probeResult.metadata
          });
        }
      }

      if (fileItems.length === 0) {
        return { canceled: true };
      }

      // First valid item becomes activeFile for single-file backwards compatibility
      const firstValid = fileItems.find((item) => item.metadata);
      if (firstValid && firstValid.metadata) {
        activeFile = {
          filePath: firstValid.filePath,
          metadata: firstValid.metadata
        };
      }

      // If single file selected and had an error, return top-level error
      const firstItem = fileItems[0];
      if (fileItems.length === 1 && firstItem?.error) {
        return {
          canceled: false,
          filePath: firstItem.filePath,
          error: firstItem.error,
          files: fileItems
        };
      }

      return {
        canceled: false,
        filePath: activeFile?.filePath,
        metadata: activeFile?.metadata,
        files: fileItems
      };
    } catch (err) {
      logger.error('Failed to open native video file dialog', err);
      const structuredErr: StructuredError = {
        code: 'FILE_DIALOG_FAILED',
        userMessage: 'The system file dialog could not be opened.'
      };
      return { canceled: false, error: structuredErr };
    }
  };

  // Register on both video:select and legacy channel for backward compatibility
  ipcMain.handle(IPC_CHANNELS.SELECT_VIDEO, handleSelectVideo);
  ipcMain.handle(IPC_CHANNELS.SELECT_VIDEO_FILE, handleSelectVideo);

  // Handler: Select custom output directory
  ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT_DIR, async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Destination Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const rawPath = result.filePaths[0];
      const validatedDir = validateOutputDirectoryPath(rawPath);

      return { canceled: false, dirPath: validatedDir };
    } catch (err) {
      logger.error('Failed to select destination folder', err);
      return {
        canceled: false,
        error: {
          code: 'PERMISSION_DENIED',
          userMessage: 'Failed to access selected destination folder.'
        }
      };
    }
  });

  // Handler: Start video compression
  ipcMain.handle(
    IPC_CHANNELS.START_COMPRESSION,
    async (_event, rawSettings: unknown, rawTargetPath?: unknown) => {
      try {
        let fileToProcess: ActiveFileState | null = null;

        if (typeof rawTargetPath === 'string' && rawTargetPath.trim()) {
          const validated = validateInputVideoPath(rawTargetPath);
          fileToProcess = activeFiles.get(validated) || null;
          if (!fileToProcess) {
            const probeResult = await probeVideoFile(validated);
            if (!probeResult.success) {
              return { success: false, error: probeResult.error };
            }
            fileToProcess = {
              filePath: validated,
              metadata: probeResult.metadata
            };
            activeFiles.set(validated, fileToProcess);
          }
        } else {
          fileToProcess = activeFile;
        }

        if (!fileToProcess) {
          return {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              userMessage: 'No video file has been selected.'
            }
          };
        }

        if (audioExtractorSupervisor.isRunning()) {
          return {
            success: false,
            error: {
              code: 'ALREADY_RUNNING',
              userMessage: 'An audio extraction task is currently running. Please wait or cancel it.'
            }
          };
        }

        // Schema validate incoming settings
        const settings = validateCompressionSettings(rawSettings);

        const compressionResult = await jobSupervisor.startCompression(
          fileToProcess.filePath,
          fileToProcess.metadata.durationSeconds,
          settings,
          (progress) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.PROGRESS_EVENT, progress);
            }
          },
          fileToProcess.metadata.hasAudio,
          fileToProcess.metadata
        );

        return compressionResult;
      } catch (err) {
        logger.error('Unhandled compression error', err);
        return {
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: err instanceof Error ? err.message : 'An unexpected compression error occurred.'
          }
        };
      }
    }
  );

  // Handler: Cancel video compression
  ipcMain.handle(IPC_CHANNELS.CANCEL_COMPRESSION, async () => {
    const wasRunning = await jobSupervisor.cancel();
    return { success: wasRunning };
  });

  // Handler: Start audio extraction
  ipcMain.handle(
    IPC_CHANNELS.START_AUDIO_EXTRACTION,
    async (_event, rawSettings: unknown, rawTargetPath?: unknown) => {
      try {
        let fileToProcess: ActiveFileState | null = null;

        if (typeof rawTargetPath === 'string' && rawTargetPath.trim()) {
          const validated = validateInputVideoPath(rawTargetPath);
          fileToProcess = activeFiles.get(validated) || null;
          if (!fileToProcess) {
            const probeResult = await probeVideoFile(validated);
            if (!probeResult.success) {
              return { success: false, error: probeResult.error };
            }
            fileToProcess = {
              filePath: validated,
              metadata: probeResult.metadata
            };
            activeFiles.set(validated, fileToProcess);
          }
        } else {
          fileToProcess = activeFile;
        }

        if (!fileToProcess) {
          return {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              userMessage: 'No video file has been selected.'
            }
          };
        }

        if (!fileToProcess.metadata.hasAudio || fileToProcess.metadata.audioStreams.length === 0) {
          return {
            success: false,
            error: {
              code: 'AUDIO_STREAM_NOT_FOUND',
              userMessage: 'This video does not contain an audio stream that can be extracted.'
            }
          };
        }

        if (jobSupervisor.isRunning()) {
          return {
            success: false,
            error: {
              code: 'ALREADY_RUNNING',
              userMessage: 'A video compression task is currently running. Please wait or cancel it.'
            }
          };
        }

        const settings = validateAudioExtractionSettings(rawSettings);

        const selectedStream =
          fileToProcess.metadata.audioStreams[settings.audioStreamIndex] || fileToProcess.metadata.audioStreams[0];

        if (!selectedStream) {
          return {
            success: false,
            error: {
              code: 'AUDIO_STREAM_NOT_FOUND',
              userMessage: 'Selected audio stream index does not exist in video.'
            }
          };
        }

        const extractionResult = await audioExtractorSupervisor.startExtraction(
          fileToProcess.filePath,
          fileToProcess.metadata.durationSeconds,
          selectedStream,
          settings,
          (progress) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.AUDIO_PROGRESS_EVENT, progress);
            }
          }
        );

        return extractionResult;
      } catch (err) {
        logger.error('Unhandled audio extraction error', err);
        return {
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: err instanceof Error ? err.message : 'An unexpected audio extraction error occurred.'
          }
        };
      }
    }
  );

  // Handler: Cancel audio extraction
  ipcMain.handle(IPC_CHANNELS.CANCEL_AUDIO_EXTRACTION, async () => {
    const wasRunning = await audioExtractorSupervisor.cancel();
    return { success: wasRunning };
  });

  // Handler: Select Image Files
  const activeImages = new Map<string, ImageMetadata>();

  ipcMain.handle(IPC_CHANNELS.SELECT_IMAGES, async (): Promise<ImageSelectionResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Image File(s)',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Supported Images (JPG, PNG, WebP, BMP)',
            extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp']
          }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const items: ImageQueueItem[] = [];

      for (const rawPath of result.filePaths) {
        if (!rawPath) continue;

        let validatedPath: string;
        try {
          validatedPath = validateInputImagePath(rawPath);
        } catch (valErr) {
          logger.warn('Image path validation failed for ' + rawPath, valErr);
          items.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            filePath: rawPath,
            fileName: path.basename(rawPath),
            fileSizeBytes: 0,
            formattedSize: '0 B',
            format: 'jpg',
            width: 0,
            height: 0,
            hasAlpha: false,
            status: 'failed',
            error: {
              code: 'FILE_VALIDATION_FAILED',
              userMessage: valErr instanceof Error ? valErr.message : 'Invalid or inaccessible image file.'
            }
          });
          continue;
        }

        const probeResult = await probeImageFile(validatedPath);
        if (!probeResult.success || !probeResult.metadata) {
          items.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            filePath: validatedPath,
            fileName: path.basename(validatedPath),
            fileSizeBytes: 0,
            formattedSize: '0 B',
            format: 'jpg',
            width: 0,
            height: 0,
            hasAlpha: false,
            status: 'failed',
            error: probeResult.error || {
              code: 'PROBE_FAILED',
              userMessage: 'Image probe failed.'
            }
          });
        } else {
          activeImages.set(validatedPath, probeResult.metadata);
          items.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            filePath: validatedPath,
            fileName: probeResult.metadata.fileName,
            fileSizeBytes: probeResult.metadata.fileSizeBytes,
            formattedSize: probeResult.metadata.formattedSize,
            format: probeResult.metadata.format,
            width: probeResult.metadata.width,
            height: probeResult.metadata.height,
            hasAlpha: probeResult.metadata.hasAlpha,
            thumbnailDataUrl: probeResult.metadata.thumbnailDataUrl,
            status: 'pending'
          });
        }
      }

      if (items.length === 0) {
        return { canceled: true };
      }

      return {
        canceled: false,
        files: items
      };
    } catch (err) {
      logger.error('Failed to open native image file dialog', err);
      return {
        canceled: false,
        error: {
          code: 'FILE_DIALOG_FAILED',
          userMessage: 'The system file dialog could not be opened.'
        }
      };
    }
  });

  // Handler: Start Image Compression
  ipcMain.handle(
    IPC_CHANNELS.START_IMAGE_COMPRESSION,
    async (_event, rawSettings: unknown, rawTargetPath: unknown) => {
      try {
        if (typeof rawTargetPath !== 'string' || !rawTargetPath.trim()) {
          return {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              userMessage: 'Target image path is missing.'
            }
          };
        }

        const validatedPath = validateInputImagePath(rawTargetPath);
        let metadata = activeImages.get(validatedPath);

        if (!metadata) {
          const probeResult = await probeImageFile(validatedPath);
          if (!probeResult.success || !probeResult.metadata) {
            return {
              success: false,
              error: probeResult.error || {
                code: 'PROBE_FAILED',
                userMessage: 'Could not probe image metadata.'
              }
            };
          }
          metadata = probeResult.metadata;
          activeImages.set(validatedPath, metadata);
        }

        if (jobSupervisor.isRunning() || audioExtractorSupervisor.isRunning()) {
          return {
            success: false,
            error: {
              code: 'ALREADY_RUNNING',
              userMessage: 'Another media processing task is currently active.'
            }
          };
        }

        const settings = validateImageCompressionSettings(rawSettings);
        const result = await imageJobSupervisor.compressImage(validatedPath, metadata, settings);
        return result;
      } catch (err) {
        logger.error('Unhandled image compression error', err);
        return {
          success: false,
          error: {
            code: 'COMPRESSION_FAILED',
            userMessage: err instanceof Error ? err.message : 'An unexpected image compression error occurred.'
          }
        };
      }
    }
  );

  // Handler: Cancel Image Compression
  ipcMain.handle(IPC_CHANNELS.CANCEL_IMAGE_COMPRESSION, async () => {
    const wasRunning = await imageJobSupervisor.cancel();
    return { success: wasRunning };
  });

  // Handler: Reveal output file in Explorer
  ipcMain.handle(IPC_CHANNELS.SHOW_IN_FOLDER, async (_event, rawPath: unknown) => {
    try {
      const safePath = validateSafePath(rawPath, 'revealPath');
      shell.showItemInFolder(safePath);
    } catch (err) {
      logger.warn('Failed to reveal file in explorer', err);
    }
  });
}
