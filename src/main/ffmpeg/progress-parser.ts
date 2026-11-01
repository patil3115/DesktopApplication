import { CompressionProgress } from '../../common/types';

/**
 * Parses FFmpeg stderr progress output strings.
 * Example line:
 * frame=  120 fps= 59.2 q=24.0 size=    1536kB time=00:00:04.50 bitrate=2796.2kbits/s speed=2.2x
 */
export function parseFfmpegProgress(
  chunkText: string,
  totalDurationSeconds: number
): CompressionProgress | null {
  // Extract time=HH:MM:SS.xx or time=SS.xx
  const timeMatch = chunkText.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!timeMatch) {
    return null;
  }

  const hours = parseInt(timeMatch[1] ?? '0', 10);
  const minutes = parseInt(timeMatch[2] ?? '0', 10);
  const seconds = parseFloat(timeMatch[3] ?? '0');
  const currentTimeSeconds = hours * 3600 + minutes * 60 + seconds;

  // Extract FPS
  const fpsMatch = chunkText.match(/fps=\s*([\d.]+)/);
  const fps = fpsMatch && fpsMatch[1] ? parseFloat(fpsMatch[1]) : 0;

  // Extract Frame
  const frameMatch = chunkText.match(/frame=\s*(\d+)/);
  const currentFrame = frameMatch && frameMatch[1] ? parseInt(frameMatch[1], 10) : 0;

  // Extract Speed
  const speedMatch = chunkText.match(/speed=\s*([\d.]+x)/);
  const speed = speedMatch && speedMatch[1] ? speedMatch[1] : '1.0x';

  // Calculate percentage safely
  let percent = 0;
  if (totalDurationSeconds > 0) {
    percent = Math.min(100, Math.max(0, (currentTimeSeconds / totalDurationSeconds) * 100));
    // Round to 1 decimal place
    percent = Math.round(percent * 10) / 10;
  }

  return {
    percent,
    currentFrame,
    fps: Math.round(fps),
    currentTimeSeconds: Math.round(currentTimeSeconds * 10) / 10,
    totalTimeSeconds: Math.round(totalDurationSeconds * 10) / 10,
    speed
  };
}
