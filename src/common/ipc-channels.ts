/**
 * Strict allowlist of IPC channel identifiers.
 * No dynamic or arbitrary IPC channel strings permitted.
 */

export const IPC_CHANNELS = {
  SELECT_VIDEO: 'video:select',
  SELECT_VIDEO_FILE: 'secure-compressor:select-video-file',
  SELECT_OUTPUT_DIR: 'secure-compressor:select-output-dir',
  START_COMPRESSION: 'secure-compressor:start-compression',
  CANCEL_COMPRESSION: 'secure-compressor:cancel-compression',
  SHOW_IN_FOLDER: 'secure-compressor:show-in-folder',
  PROGRESS_EVENT: 'secure-compressor:progress-event',

  // Video -> Audio extraction channels
  START_AUDIO_EXTRACTION: 'audio:extract-start',
  CANCEL_AUDIO_EXTRACTION: 'audio:extract-cancel',
  AUDIO_PROGRESS_EVENT: 'audio:extract-progress'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
