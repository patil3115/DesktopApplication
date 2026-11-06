import { VideoCodecOption, AudioCodecOption } from './types';

/**
 * Formats byte values into readable units (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const kb = 1024;

  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(1)} MB`;
  }
  if (bytes >= kb) {
    return `${(bytes / kb).toFixed(1)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

/**
 * Calculates the dynamic minimum technically feasible target size in bytes.
 *
 * Factors considered:
 * - Video duration: longer videos require proportionally more bits.
 * - Video resolution (width/height): higher resolution needs more bits to avoid severe macroblocking.
 * - Frame rate: higher fps requires more bits.
 * - Video codec: H.265 is ~35% more bit-efficient than H.264 at low bitrates.
 * - Audio configuration: uncompressed/AAC streams have floor bitrates, or 0 if muted.
 * - Container overhead: MP4 container moov/mdat/stbl indexing overhead (~32KB + 1.5% stream data).
 * - Original file size: minimum will never exceed 90% of original.
 */
export function calculateMinTargetSizeBytes(params: {
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: VideoCodecOption;
  audioCodec?: AudioCodecOption;
  hasAudio?: boolean;
  originalSizeBytes?: number;
}): number {
  const duration = Math.max(0.5, params.durationSeconds || 1);
  const width = params.width && params.width > 0 ? params.width : 1280;
  const height = params.height && params.height > 0 ? params.height : 720;
  const fps = params.fps && params.fps > 0 ? Math.min(params.fps, 60) : 30;

  // Base pixel scale relative to 720p (921,600 pixels)
  const pixelCount = width * height;
  const pixelScale = Math.min(4, Math.max(0.25, pixelCount / (1280 * 720)));
  const fpsScale = Math.min(2, Math.max(0.6, fps / 30));

  // Minimum viable video bitrate in kbps
  // For H.264, standard absolute floor is ~100 kbps for 720p; for H.265 it is ~65 kbps
  const isH265 = params.codec === 'h265';
  const baseFloorKbps = isH265 ? 65 : 100;
  const minVideoBitrateKbps = Math.min(
    1000,
    Math.max(isH265 ? 40 : 60, Math.round(baseFloorKbps * Math.sqrt(pixelScale) * Math.sqrt(fpsScale)))
  );

  // Minimum viable audio bitrate in kbps
  let minAudioBitrateKbps = 0;
  if (params.audioCodec !== 'none' && params.hasAudio !== false) {
    if (params.audioCodec === 'copy') {
      minAudioBitrateKbps = 128; // safe assumption for stream copy
    } else {
      minAudioBitrateKbps = 64; // AAC floor
    }
  }

  // Calculate stream data size
  const totalMinKbps = minVideoBitrateKbps + minAudioBitrateKbps;
  const streamBytes = Math.ceil((totalMinKbps * 1000 * duration) / 8);

  // MP4 container structure overhead: box headers + faststart index
  const containerOverheadBytes = Math.max(32 * 1024, Math.ceil(streamBytes * 0.015));

  let minFeasibleBytes = streamBytes + containerOverheadBytes;

  // Conservative lower bound: at least 16 KB
  minFeasibleBytes = Math.max(16 * 1024, minFeasibleBytes);

  // Cap against original file size if known
  if (params.originalSizeBytes && params.originalSizeBytes > 0) {
    if (minFeasibleBytes >= params.originalSizeBytes) {
      // Very small input file: set minimum to 20% or 8KB
      minFeasibleBytes = Math.max(8 * 1024, Math.floor(params.originalSizeBytes * 0.2));
    } else if (minFeasibleBytes > params.originalSizeBytes * 0.9) {
      minFeasibleBytes = Math.max(8 * 1024, Math.floor(params.originalSizeBytes * 0.85));
    }
  }

  return minFeasibleBytes;
}

export interface BitrateCalculationResult {
  readonly totalBitrateKbps: number;
  readonly videoBitrateKbps: number;
  readonly audioBitrateKbps: number;
  readonly containerOverheadKbps: number;
  readonly isViable: boolean;
  readonly warning?: string;
}

/**
 * Calculates video and audio target bitrates from target size and duration.
 *
 * Formula:
 * Total target bitrate = Target file size in bits / Video duration
 * Video target bitrate = Total target bitrate - Audio bitrate - Container overhead estimate
 */
export function calculateTargetBitrate(params: {
  targetSizeBytes: number;
  durationSeconds: number;
  codec?: VideoCodecOption;
  audioCodec?: AudioCodecOption;
  hasAudio?: boolean;
  inputAudioBitrateKbps?: number;
}): BitrateCalculationResult {
  const duration = Math.max(0.5, params.durationSeconds || 1);
  const totalBits = params.targetSizeBytes * 8;
  const totalBitrateKbps = Math.floor((totalBits / duration) / 1000);

  // Container overhead estimate (~2% of bandwidth, min 8 kbps)
  const containerOverheadKbps = Math.max(8, Math.round(totalBitrateKbps * 0.02));

  // Determine audio allocation
  let audioBitrateKbps = 0;
  if (params.audioCodec !== 'none' && params.hasAudio !== false) {
    if (params.audioCodec === 'copy') {
      audioBitrateKbps = Math.min(
        params.inputAudioBitrateKbps || 128,
        Math.max(64, totalBitrateKbps - 64)
      );
    } else {
      // Dynamic AAC allocation based on total bandwidth budget
      if (totalBitrateKbps > 1200) {
        audioBitrateKbps = 192;
      } else if (totalBitrateKbps > 600) {
        audioBitrateKbps = 128;
      } else if (totalBitrateKbps > 250) {
        audioBitrateKbps = 96;
      } else {
        audioBitrateKbps = 64;
      }
    }
  }

  // Remaining budget goes to video
  let videoBitrateKbps = totalBitrateKbps - audioBitrateKbps - containerOverheadKbps;

  // Codec floor
  const isH265 = params.codec === 'h265';
  const minViableVideoKbps = isH265 ? 40 : 60;

  let isViable = true;
  let warning: string | undefined = undefined;

  if (videoBitrateKbps < minViableVideoKbps) {
    isViable = false;
    warning = `Calculated video bitrate (${videoBitrateKbps} kbps) is below minimum viable threshold for ${
      isH265 ? 'H.265' : 'H.264'
    } (${minViableVideoKbps} kbps).`;
    videoBitrateKbps = Math.max(minViableVideoKbps, videoBitrateKbps);
  }

  return {
    totalBitrateKbps,
    videoBitrateKbps,
    audioBitrateKbps,
    containerOverheadKbps,
    isViable,
    warning
  };
}

/**
 * Calculates mathematical estimated reduction percentage.
 */
export function calculateReductionPercentage(originalBytes: number, targetBytes: number): number {
  if (originalBytes <= 0 || targetBytes >= originalBytes) {
    return 0;
  }
  const diff = originalBytes - targetBytes;
  return Math.max(0, Math.min(99.9, Math.round(((diff / originalBytes) * 100) * 10) / 10));
}
