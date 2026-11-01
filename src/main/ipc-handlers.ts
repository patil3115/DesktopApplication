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
import { VideoMetadata, StructuredError, FileSelectionResult } from '../common/types';
import { logger } from './utils/logger';

interface ActiveFileState {
  filePath: string;
  metadata: VideoMetadata;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  let activeFile: ActiveFileState | null = null;

  // Shared file selection handler
  const handleSelectVideo = async (): Promise<FileSelectionResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Video File',
        properties: ['openFile'],
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

      const rawPath = result.filePaths[0];
      if (!rawPath) {
        return { canceled: true };
      }

      let validatedPath: string;
      try {
        validatedPath = validateInputVideoPath(rawPath);
      } catch (valErr) {
        logger.warn('File validation failed', valErr);
        return {
          canceled: false,
          error: {
            code: 'FILE_VALIDATION_FAILED',
            userMessage: valErr instanceof Error ? valErr.message : 'Invalid or inaccessible video file.'
          }
        };
      }

      // Probe video metadata securely
      const probeResult = await probeVideoFile(validatedPath);
      if (!probeResult.success) {
        return {
          canceled: false,
          error: probeResult.error
        };
      }

      // State is securely tracked in the Main process
      activeFile = {
        filePath: validatedPath,
        metadata: probeResult.metadata
      };

      return {
        canceled: false,
        filePath: validatedPath,
        metadata: probeResult.metadata
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
  ipcMain.handle(IPC_CHANNELS.START_COMPRESSION, async (_event, rawSettings: unknown) => {
    try {
      if (!activeFile) {
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
        activeFile.filePath,
        activeFile.metadata.durationSeconds,
        settings,
        (progress) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.PROGRESS_EVENT, progress);
          }
        },
        activeFile.metadata.hasAudio
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
  });

  // Handler: Cancel video compression
  ipcMain.handle(IPC_CHANNELS.CANCEL_COMPRESSION, async () => {
    const wasRunning = await jobSupervisor.cancel();
    return { success: wasRunning };
  });

  // Handler: Start audio extraction
  ipcMain.handle(IPC_CHANNELS.START_AUDIO_EXTRACTION, async (_event, rawSettings: unknown) => {
    try {
      if (!activeFile) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            userMessage: 'No video file has been selected.'
          }
        };
      }

      if (!activeFile.metadata.hasAudio || activeFile.metadata.audioStreams.length === 0) {
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
        activeFile.metadata.audioStreams[settings.audioStreamIndex] || activeFile.metadata.audioStreams[0];

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
        activeFile.filePath,
        activeFile.metadata.durationSeconds,
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
  });

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
