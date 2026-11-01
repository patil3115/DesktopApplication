/**
 * Common formatting and parsing utilities.
 * Pure functions with zero external dependencies.
 */

/**
 * Format bytes into human-readable representation:
 * < 1 KB    -> B
 * < 1 MB    -> KB
 * < 1 GB    -> MB
 * < 1 TB    -> GB
 * otherwise -> TB
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  const TB = 1024 * GB;

  if (bytes < KB) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < MB) {
    const val = bytes / KB;
    return `${val < 10 ? val.toFixed(1) : Math.round(val)} KB`;
  }
  if (bytes < GB) {
    const val = bytes / MB;
    return `${val.toFixed(1)} MB`;
  }
  if (bytes < TB) {
    const val = bytes / GB;
    return `${val.toFixed(2)} GB`;
  }
  const val = bytes / TB;
  return `${val.toFixed(2)} TB`;
}

/**
 * Formats a duration in seconds into HH:MM:SS or MM:SS.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Safely parses a rational number string (e.g. "60000/1001", "30/1", "29.97").
 * Returns null if invalid, zero, or non-finite.
 */
export function parseRational(val?: string | null): number | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '0/0' || trimmed === 'N/A') return null;

  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length !== 2) return null;
    const num = parseFloat(parts[0] ?? '0');
    const den = parseFloat(parts[1] ?? '0');
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) {
      return null;
    }
    const result = num / den;
    return Number.isFinite(result) && result > 0 ? result : null;
  }

  const num = parseFloat(trimmed);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Formats a numeric FPS into user-facing display string:
 * - Non-integers rounded to at most 2 decimal places (59.94, 29.97, 23.98)
 * - Trailing zeros stripped (30.00 -> 30, 60.00 -> 60)
 * - VFR indication if applicable
 */
export function formatFps(fps: number, isVfr?: boolean): string {
  if (!Number.isFinite(fps) || fps <= 0) return 'Unknown';

  const rounded = Math.round(fps * 100) / 100;
  const formattedNumber = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');

  if (isVfr) {
    return `~${formattedNumber} fps (VFR)`;
  }
  return `${formattedNumber} fps`;
}

export interface ExtractedFps {
  readonly fps: number;
  readonly formattedFps: string;
  readonly isVfr: boolean;
}

/**
 * Extracts and calculates the actual video stream FPS.
 *
 * Prevents the critical 90kHz time base bug:
 * Containers (MP4, MPEG-TS, DJI drone files, screen recordings) frequently report
 * r_frame_rate as "90000/1" or "1000/1" (reflecting the 90kHz timestamp clock).
 * This function cross-checks avg_frame_rate, r_frame_rate, and time_base to return
 * the true playback framerate and never an invalid time base frequency.
 */
export function extractFpsFromStream(stream?: {
  avg_frame_rate?: string | null;
  r_frame_rate?: string | null;
  time_base?: string | null;
  codec_time_base?: string | null;
}): ExtractedFps {
  if (!stream) {
    return { fps: 0, formattedFps: 'Unknown', isVfr: false };
  }

  const avgFps = parseRational(stream.avg_frame_rate);
  const rFps = parseRational(stream.r_frame_rate);
  const tb = parseRational(stream.time_base);
  const timeBaseFreq = tb && tb > 0 ? Math.round(1 / tb) : null;

  // Filter out rates that are time base clock artifacts (e.g. 90000, 1000, etc.)
  // Normal video framerates do not exceed 300 fps.
  const isTimeBaseArtifact = (rate: number | null): boolean => {
    if (!rate || rate <= 0) return true;
    if (rate >= 1000) return true;
    if (timeBaseFreq && Math.abs(rate - timeBaseFreq) < 1) return true;
    return false;
  };

  const validAvg = avgFps && !isTimeBaseArtifact(avgFps) && avgFps > 0 && avgFps <= 300 ? avgFps : null;
  const validR = rFps && !isTimeBaseArtifact(rFps) && rFps > 0 && rFps <= 300 ? rFps : null;

  let selectedFps: number | null = null;
  let isVfr = false;

  if (validAvg && validR) {
    const diff = Math.abs(validAvg - validR);
    if (diff < 0.05) {
      // Constant Frame Rate (CFR)
      selectedFps = validAvg;
      isVfr = false;
    } else {
      // Variable Frame Rate (VFR) - avg_frame_rate represents real frame count / duration
      selectedFps = validAvg;
      isVfr = true;
    }
  } else if (validAvg) {
    selectedFps = validAvg;
    const hadClockArtifact = Boolean(rFps && isTimeBaseArtifact(rFps));
    const isStandardCfr = [23.98, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120, 240].some(
      std => Math.abs(validAvg - std) < 0.05
    );
    isVfr = hadClockArtifact && !isStandardCfr;
  } else if (validR) {
    selectedFps = validR;
    isVfr = false;
  }

  // Fallback: If both were filtered out, check if any positive value under 300 exists
  if (!selectedFps || selectedFps <= 0) {
    if (avgFps && avgFps > 0 && avgFps <= 300) {
      selectedFps = avgFps;
    } else if (rFps && rFps > 0 && rFps <= 300) {
      selectedFps = rFps;
    }
  }

  if (!selectedFps || selectedFps <= 0) {
    return { fps: 0, formattedFps: 'Unknown', isVfr: false };
  }

  const rounded = Math.round(selectedFps * 100) / 100;
  return {
    fps: rounded,
    formattedFps: formatFps(rounded, isVfr),
    isVfr
  };
}
