/**
 * Common Type Definitions and Data Transfer Objects (DTOs)
 * Strict typing across Main, Preload, and Renderer processes.
 */

export interface AudioStreamInfo {
  readonly index: number;
  readonly audioIndex: number;
  readonly codec: string;
  readonly channels: number;
  readonly channelLayout: string;
  readonly sampleRate: number;
  readonly formattedSampleRate: string;
  readonly bitrateKbps: number;
  readonly title?: string;
  readonly language?: string;
  readonly label: string;
}

export interface VideoMetadata {
  readonly fileName: string;
  readonly filePath: string;
  readonly fileSizeBytes: number;
  readonly formattedSize: string;
  readonly durationSeconds: number;
  readonly formattedDuration: string;
  readonly width: number;
  readonly height: number;
  readonly resolutionLabel: string;
  readonly videoCodec: string;
  readonly audioCodec: string | null;
  readonly fps: number;
  readonly formattedFps: string;
  readonly bitrateKbps: number;
  readonly audioStreams: AudioStreamInfo[];
  readonly hasAudio: boolean;
}

export type QualityPreset = 'auto' | 'high' | 'medium' | 'low' | 'custom';
export type ResolutionOption = 'original' | '1080p' | '720p' | '480p';
export type VideoCodecOption = 'h264' | 'h265';
export type AudioCodecOption = 'aac' | 'copy' | 'none';

export interface CompressionSettings {
  readonly quality: QualityPreset;
  readonly resolution: ResolutionOption;
  readonly codec: VideoCodecOption;
  readonly audioCodec: AudioCodecOption;
  readonly removeMetadata: boolean;
  readonly customOutputDir?: string | null;
  readonly targetSizeBytes?: number | null;
  readonly targetPercent?: number | null;
}

export type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'flac' | 'ogg';
export type AudioBitrate = '128k' | '192k' | '256k' | '320k';

export interface AudioExtractionSettings {
  readonly format: AudioFormat;
  readonly bitrate?: AudioBitrate;
  readonly audioStreamIndex: number;
  readonly removeMetadata: boolean;
  readonly customOutputDir?: string | null;
}

export interface AudioExtractionResult {
  readonly success: boolean;
  readonly outputPath: string;
  readonly outputFileName: string;
  readonly format: AudioFormat;
  readonly audioSizeBytes: number;
  readonly formattedSize: string;
  readonly durationSeconds: number;
  readonly wasStreamCopied: boolean;
}

export interface CompressionProgress {
  readonly percent: number;
  readonly currentFrame: number;
  readonly fps: number;
  readonly currentTimeSeconds: number;
  readonly totalTimeSeconds: number;
  readonly speed: string;
}

export interface CompressionResult {
  readonly success: boolean;
  readonly outputPath: string;
  readonly outputFileName: string;
  readonly originalSizeBytes: number;
  readonly compressedSizeBytes: number;
  readonly reductionPercentage: number;
  readonly durationSeconds: number;
  readonly targetSizeBytes?: number;
}

export interface StructuredError {
  readonly code:
    | 'ELECTRON_RUNTIME_UNAVAILABLE'
    | 'PRELOAD_UNAVAILABLE'
    | 'IPC_UNAVAILABLE'
    | 'FILE_DIALOG_FAILED'
    | 'FILE_SELECTION_CANCELLED'
    | 'FILE_VALIDATION_FAILED'
    | 'AUDIO_STREAM_NOT_FOUND'
    | 'UNSUPPORTED_AUDIO_CODEC'
    | 'INVALID_INPUT'
    | 'PROBE_FAILED'
    | 'FFMPEG_NOT_FOUND'
    | 'FFMPEG_CORRUPTED'
    | 'COMPRESSION_FAILED'
    | 'MUXER_FAILURE'
    | 'INVALID_ENCODER_ARGUMENT'
    | 'ENCODER_UNAVAILABLE'
    | 'DECODER_FAILURE'
    | 'OUTPUT_VALIDATION_FAILED'
    | 'INSUFFICIENT_DISK_SPACE'
    | 'PERMISSION_DENIED'
    | 'ALREADY_RUNNING'
    | 'CANCELLED'
    | 'UNKNOWN_ERROR';
  readonly userMessage: string;
}

export interface SelectedFileItem {
  readonly filePath: string;
  readonly metadata?: VideoMetadata;
  readonly error?: StructuredError;
}

export interface FileSelectionResult {
  readonly canceled: boolean;
  readonly filePath?: string;
  readonly metadata?: VideoMetadata;
  readonly error?: StructuredError;
  readonly files?: SelectedFileItem[];
}

export interface BatchItemResult {
  readonly filePath: string;
  readonly fileName: string;
  readonly success: boolean;
  readonly result?: CompressionResult | AudioExtractionResult;
  readonly error?: StructuredError;
}

export interface VideoQueueItem {
  readonly id: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly formattedSize: string;
  readonly durationSeconds: number;
  readonly formattedDuration: string;
  readonly resolutionLabel: string;
  readonly hasAudio: boolean;
  readonly metadata: VideoMetadata;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  compressResult?: CompressionResult;
  audioResult?: AudioExtractionResult;
  error?: StructuredError;
  targetSizeBytes?: number;
  targetPercent?: number;
}

export interface VideoCompressorAPI {
  getRuntimeInfo?(): { electron: boolean; preload: boolean; apiVersion: number };
  selectVideo(): Promise<FileSelectionResult>;
  selectVideoFile(): Promise<FileSelectionResult>;
  selectOutputDirectory(): Promise<{ canceled: boolean; dirPath?: string; error?: StructuredError }>;
  startCompression(settings: CompressionSettings, targetFilePath?: string): Promise<{ success: boolean; result?: CompressionResult; error?: StructuredError }>;
  cancelCompression(): Promise<{ success: boolean }>;
  startAudioExtraction(settings: AudioExtractionSettings, targetFilePath?: string): Promise<{ success: boolean; result?: AudioExtractionResult; error?: StructuredError }>;
  cancelAudioExtraction(): Promise<{ success: boolean }>;
  showInFolder(filePath: string): Promise<void>;
  onProgress(callback: (progress: CompressionProgress) => void): () => void;
  onAudioProgress(callback: (progress: CompressionProgress) => void): () => void;
}
