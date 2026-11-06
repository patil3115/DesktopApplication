import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../common/ipc-channels';
import {
  validateCompressionSettings,
  validateAudioExtractionSettings,
  validateSafePath
} from '../common/validators';
import { validateInputVideoPath, validateOutputDirectoryPath } from './fs/path-sanitizer';
import { probeVideoFile } from './ffmpeg/probe';
import { jobSupervisor } from './ffmpeg/compressor';
import { audioExtractorSupervisor } from './ffmpeg/audio-extractor';
import { VideoMetadata, StructuredError, FileSelectionResult, SelectedFileItem } from '../common/types';
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
