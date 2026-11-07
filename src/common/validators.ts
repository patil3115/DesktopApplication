import {
  CompressionSettings,
  QualityPreset,
  ResolutionOption,
  VideoCodecOption,
  AudioCodecOption,
  AudioExtractionSettings,
  AudioFormat,
  AudioBitrate,
  ImageCompressionSettings,
  ImageResizeSettings,
  ImageOutputFormat
} from './types';

const VALID_QUALITY: ReadonlySet<string> = new Set<QualityPreset>(['auto', 'high', 'medium', 'low', 'custom']);
const VALID_RESOLUTION: ReadonlySet<string> = new Set<ResolutionOption>(['original', '1080p', '720p', '480p']);
const VALID_VIDEO_CODECS: ReadonlySet<string> = new Set<VideoCodecOption>(['h264', 'h265']);
const VALID_AUDIO_CODECS: ReadonlySet<string> = new Set<AudioCodecOption>(['aac', 'copy', 'none']);

const VALID_AUDIO_FORMATS: ReadonlySet<string> = new Set<AudioFormat>(['mp3', 'm4a', 'wav', 'flac', 'ogg']);
const VALID_AUDIO_BITRATES: ReadonlySet<string> = new Set<AudioBitrate>(['128k', '192k', '256k', '320k']);
const VALID_IMAGE_OUTPUT_FORMATS: ReadonlySet<string> = new Set<ImageOutputFormat>(['original', 'jpg', 'png', 'webp']);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates a Windows filesystem path string:
 * - Must be non-empty string
 * - No null bytes (\0)
 * - Must not exceed MAX_PATH (or realistic limit: 4096)
 * - Must not start with UNC prefix (\\ or //)
 */
export function validateSafePath(pathInput: unknown, fieldName = 'path'): string {
  if (typeof pathInput !== 'string') {
    throw new ValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = pathInput.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty.`);
  }

  if (trimmed.length > 4096) {
    throw new ValidationError(`${fieldName} exceeds maximum allowable path length.`);
  }

  if (trimmed.includes('\0')) {
    throw new ValidationError(`${fieldName} contains invalid null byte characters.`);
  }

  // Reject UNC network shares to prevent SMB hash harvesting
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    throw new ValidationError(`${fieldName} cannot be a UNC network share path.`);
  }

  return trimmed;
}

/**
 * Validates compression settings payload from Renderer
 */
export function validateCompressionSettings(input: unknown): CompressionSettings {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Compression settings must be an object.');
  }

  const rec = input as Record<string, unknown>;

  if (typeof rec['quality'] !== 'string' || !VALID_QUALITY.has(rec['quality'])) {
    throw new ValidationError(`Invalid quality preset: ${String(rec['quality'])}`);
  }

  if (typeof rec['resolution'] !== 'string' || !VALID_RESOLUTION.has(rec['resolution'])) {
    throw new ValidationError(`Invalid resolution option: ${String(rec['resolution'])}`);
  }

  if (typeof rec['codec'] !== 'string' || !VALID_VIDEO_CODECS.has(rec['codec'])) {
    throw new ValidationError(`Invalid video codec: ${String(rec['codec'])}`);
  }

  if (typeof rec['audioCodec'] !== 'string' || !VALID_AUDIO_CODECS.has(rec['audioCodec'])) {
    throw new ValidationError(`Invalid audio codec: ${String(rec['audioCodec'])}`);
  }

  if (typeof rec['removeMetadata'] !== 'boolean') {
    throw new ValidationError('removeMetadata must be a boolean.');
  }

  let customOutputDir: string | undefined = undefined;
  if (rec['customOutputDir'] !== undefined && rec['customOutputDir'] !== null) {
    customOutputDir = validateSafePath(rec['customOutputDir'], 'customOutputDir');
  }

  let targetSizeBytes: number | null | undefined = undefined;
  if (rec['targetSizeBytes'] !== undefined && rec['targetSizeBytes'] !== null) {
    const parsedTarget = Number(rec['targetSizeBytes']);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0 || !Number.isInteger(parsedTarget)) {
      throw new ValidationError('targetSizeBytes must be a positive integer.');
    }
    targetSizeBytes = parsedTarget;
  }

  let targetPercent: number | null | undefined = undefined;
  if (rec['targetPercent'] !== undefined && rec['targetPercent'] !== null) {
    const parsedPercent = Number(rec['targetPercent']);
    if (!Number.isFinite(parsedPercent) || parsedPercent <= 0 || parsedPercent > 100) {
      throw new ValidationError('targetPercent must be a number between 1 and 100.');
    }
    targetPercent = parsedPercent;
  }

  return {
    quality: rec['quality'] as QualityPreset,
    resolution: rec['resolution'] as ResolutionOption,
    codec: rec['codec'] as VideoCodecOption,
    audioCodec: rec['audioCodec'] as AudioCodecOption,
    removeMetadata: rec['removeMetadata'] as boolean,
    customOutputDir,
    targetSizeBytes,
    targetPercent
  };
}

/**
 * Validates audio extraction settings payload from Renderer
 */
export function validateAudioExtractionSettings(input: unknown): AudioExtractionSettings {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Audio extraction settings must be an object.');
  }

  const rec = input as Record<string, unknown>;

  if (typeof rec['format'] !== 'string' || !VALID_AUDIO_FORMATS.has(rec['format'])) {
    throw new ValidationError(`Invalid audio format: ${String(rec['format'])}`);
  }

  let bitrate: AudioBitrate | undefined = undefined;
  if (rec['bitrate'] !== undefined && rec['bitrate'] !== null) {
    if (typeof rec['bitrate'] !== 'string' || !VALID_AUDIO_BITRATES.has(rec['bitrate'])) {
      throw new ValidationError(`Invalid audio bitrate: ${String(rec['bitrate'])}`);
    }
    bitrate = rec['bitrate'] as AudioBitrate;
  }

  const audioStreamIndex = Number(rec['audioStreamIndex'] ?? 0);
  if (!Number.isInteger(audioStreamIndex) || audioStreamIndex < 0 || audioStreamIndex > 64) {
    throw new ValidationError('Invalid audio stream index.');
  }

  if (typeof rec['removeMetadata'] !== 'boolean') {
    throw new ValidationError('removeMetadata must be a boolean.');
  }

  let customOutputDir: string | undefined = undefined;
  if (rec['customOutputDir'] !== undefined && rec['customOutputDir'] !== null) {
    customOutputDir = validateSafePath(rec['customOutputDir'], 'customOutputDir');
  }

  return {
    format: rec['format'] as AudioFormat,
    bitrate,
    audioStreamIndex,
    removeMetadata: rec['removeMetadata'] as boolean,
    customOutputDir
  };
}

/**
 * Validates image compression settings payload from Renderer
 */
export function validateImageCompressionSettings(input: unknown): ImageCompressionSettings {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Image compression settings must be an object.');
  }

  const rec = input as Record<string, unknown>;

  if (typeof rec['quality'] !== 'string' || !VALID_QUALITY.has(rec['quality'])) {
    throw new ValidationError(`Invalid quality preset: ${String(rec['quality'])}`);
  }

  if (typeof rec['outputFormat'] !== 'string' || !VALID_IMAGE_OUTPUT_FORMATS.has(rec['outputFormat'])) {
    throw new ValidationError(`Invalid image output format: ${String(rec['outputFormat'])}`);
  }

  let targetSizeBytes: number | null | undefined = undefined;
  if (rec['targetSizeBytes'] !== undefined && rec['targetSizeBytes'] !== null) {
    const parsedTarget = Number(rec['targetSizeBytes']);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0 || !Number.isInteger(parsedTarget)) {
      throw new ValidationError('targetSizeBytes must be a positive integer.');
    }
    targetSizeBytes = parsedTarget;
  }

  let targetPercent: number | null | undefined = undefined;
  if (rec['targetPercent'] !== undefined && rec['targetPercent'] !== null) {
    const parsedPercent = Number(rec['targetPercent']);
    if (!Number.isFinite(parsedPercent) || parsedPercent <= 0 || parsedPercent > 100) {
      throw new ValidationError('targetPercent must be a number between 1 and 100.');
    }
    targetPercent = parsedPercent;
  }

  if (typeof rec['removeMetadata'] !== 'boolean') {
    throw new ValidationError('removeMetadata must be a boolean.');
  }

  // Validate resize settings (optional)
  let validatedResize: ImageResizeSettings = {
    enabled: false,
    mode: 'percentage',
    lockAspectRatio: true
  };
  if (rec['resize'] !== undefined && rec['resize'] !== null) {
    if (typeof rec['resize'] !== 'object') {
      throw new ValidationError('resize settings must be an object.');
    }
    const resizeRec = rec['resize'] as Record<string, unknown>;
    const resizeEnabled = Boolean(resizeRec['enabled']);
    const resizeMode = resizeRec['mode'] === 'dimensions' ? 'dimensions' : 'percentage';
    const lockAspectRatio = resizeRec['lockAspectRatio'] !== false;

    let resizePercentage: number | undefined = undefined;
    if (resizeRec['percentage'] !== undefined && resizeRec['percentage'] !== null) {
      const p = Number(resizeRec['percentage']);
      if (!Number.isFinite(p) || p <= 0 || p > 500) {
        throw new ValidationError('Resize percentage must be between 1 and 500.');
      }
      resizePercentage = p;
    }

    let resizeWidth: number | undefined = undefined;
    if (resizeRec['width'] !== undefined && resizeRec['width'] !== null) {
      const w = Number(resizeRec['width']);
      if (!Number.isFinite(w) || w <= 0 || !Number.isInteger(w) || w > 32768) {
        throw new ValidationError('Resize width must be a positive integer <= 32768.');
      }
      resizeWidth = w;
    }

    let resizeHeight: number | undefined = undefined;
    if (resizeRec['height'] !== undefined && resizeRec['height'] !== null) {
      const h = Number(resizeRec['height']);
      if (!Number.isFinite(h) || h <= 0 || !Number.isInteger(h) || h > 32768) {
        throw new ValidationError('Resize height must be a positive integer <= 32768.');
      }
      resizeHeight = h;
    }

    validatedResize = {
      enabled: resizeEnabled,
      mode: resizeMode,
      percentage: resizePercentage,
      width: resizeWidth,
      height: resizeHeight,
      lockAspectRatio
    };
  }

  let customOutputDir: string | undefined = undefined;
  if (rec['customOutputDir'] !== undefined && rec['customOutputDir'] !== null) {
    customOutputDir = validateSafePath(rec['customOutputDir'], 'customOutputDir');
  }

  return {
    quality: rec['quality'] as QualityPreset,
    outputFormat: rec['outputFormat'] as ImageOutputFormat,
    targetSizeBytes,
    targetPercent,
    resize: validatedResize,
    removeMetadata: rec['removeMetadata'] as boolean,
    customOutputDir
  };
}
