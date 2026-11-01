import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  CompressionSettings,
  CompressionProgress,
  CompressionResult,
  StructuredError,
  FileSelectionResult,
  AudioExtractionSettings,
  AudioExtractionResult
} from '../common/types';

/**
 * Hardened Preload Bridge
 * 
 * IMPORTANT FOR SANDBOXED PRELOAD:
 * In Electron with sandbox: true, Chromium's renderer sandbox does NOT support
 * relative CommonJS require() calls (e.g., require('../common/ipc-channels')).
 * Channel constants are inlined here to ensure this preload bundle has ZERO external
 * file dependencies and only requires 'electron'.
 */
const IPC_SELECT_VIDEO = 'video:select';
const IPC_SELECT_OUTPUT_DIR = 'secure-compressor:select-output-dir';
const IPC_START_COMPRESSION = 'secure-compressor:start-compression';
const IPC_CANCEL_COMPRESSION = 'secure-compressor:cancel-compression';
const IPC_SHOW_IN_FOLDER = 'secure-compressor:show-in-folder';
const IPC_PROGRESS_EVENT = 'secure-compressor:progress-event';

// Video -> Audio extraction channels
const IPC_START_AUDIO_EXTRACTION = 'audio:extract-start';
const IPC_CANCEL_AUDIO_EXTRACTION = 'audio:extract-cancel';
const IPC_AUDIO_PROGRESS_EVENT = 'audio:extract-progress';

console.log('[Preload] Loaded successfully in sandboxed renderer');

const selectVideoImpl = async (): Promise<FileSelectionResult> => {
  return await ipcRenderer.invoke(IPC_SELECT_VIDEO);
};

contextBridge.exposeInMainWorld('videoCompressor', {
  // Non-sensitive runtime diagnostic
  getRuntimeInfo: () => ({
    electron: true,
    preload: true,
    apiVersion: 1
  }),

  selectVideo: selectVideoImpl,
  selectVideoFile: selectVideoImpl,

  selectOutputDirectory: async (): Promise<{
    canceled: boolean;
    dirPath?: string;
    error?: StructuredError;
  }> => {
    return await ipcRenderer.invoke(IPC_SELECT_OUTPUT_DIR);
  },

  startCompression: async (
    settings: CompressionSettings
  ): Promise<{
    success: boolean;
    result?: CompressionResult;
    error?: StructuredError;
  }> => {
    return await ipcRenderer.invoke(IPC_START_COMPRESSION, settings);
  },

  cancelCompression: async (): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke(IPC_CANCEL_COMPRESSION);
  },

  startAudioExtraction: async (
    settings: AudioExtractionSettings
  ): Promise<{
    success: boolean;
    result?: AudioExtractionResult;
    error?: StructuredError;
  }> => {
    return await ipcRenderer.invoke(IPC_START_AUDIO_EXTRACTION, settings);
  },

  cancelAudioExtraction: async (): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke(IPC_CANCEL_AUDIO_EXTRACTION);
  },

  showInFolder: async (filePath: string): Promise<void> => {
    if (typeof filePath === 'string') {
      await ipcRenderer.invoke(IPC_SHOW_IN_FOLDER, filePath);
    }
  },

  onProgress: (callback: (progress: CompressionProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: CompressionProgress) => {
      try {
        callback(progress);
      } catch (err) {
        console.error('Progress callback error', err);
      }
    };

    ipcRenderer.on(IPC_PROGRESS_EVENT, listener);

    return () => {
      ipcRenderer.removeListener(IPC_PROGRESS_EVENT, listener);
    };
  },

  onAudioProgress: (callback: (progress: CompressionProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: CompressionProgress) => {
      try {
        callback(progress);
      } catch (err) {
        console.error('Audio progress callback error', err);
      }
    };

    ipcRenderer.on(IPC_AUDIO_PROGRESS_EVENT, listener);

    return () => {
      ipcRenderer.removeListener(IPC_AUDIO_PROGRESS_EVENT, listener);
    };
  }
});
