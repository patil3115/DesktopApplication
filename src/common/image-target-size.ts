import { ImageOutputFormat, ImageInputFormat } from './types';

/**
 * Checks if the target image format natively supports alpha transparency.
 */
export function isAlphaSupportedByFormat(format: ImageOutputFormat | ImageInputFormat): boolean {
  const norm = format.toLowerCase();
  return norm === 'png' || norm === 'webp';
}

/**
 * Calculates the dynamic minimum technically feasible target size in bytes for an image.
 * Supports both object params and positional arguments for maximum caller ergonomics.
 *
 * Factors:
 * - Image pixel area (width x height)
 * - Output format characteristics (WebP vs JPG vs PNG)
 * - Alpha transparency channel overhead
 * - Original file size constraint
 */
export function calculateMinImageTargetSizeBytes(
  widthOrParams: number | {
    width: number;
    height: number;
    format: ImageOutputFormat | ImageInputFormat;
    hasAlpha?: boolean;
    originalSizeBytes?: number;
  },
  maybeHeight?: number,
  maybeFormat?: ImageOutputFormat | ImageInputFormat,
  maybeOriginalSizeBytes?: number,
  maybeHasAlpha?: boolean
): number {
  let width: number;
  let height: number;
  let format: ImageOutputFormat | ImageInputFormat;
  let hasAlpha: boolean;
  let originalSizeBytes: number | undefined;

  if (typeof widthOrParams === 'object' && widthOrParams !== null) {
    width = widthOrParams.width;
    height = widthOrParams.height;
    format = widthOrParams.format;
    hasAlpha = Boolean(widthOrParams.hasAlpha);
    originalSizeBytes = widthOrParams.originalSizeBytes;
  } else {
    width = widthOrParams;
    height = maybeHeight || 100;
    format = maybeFormat || 'original';
    originalSizeBytes = maybeOriginalSizeBytes;
    hasAlpha = Boolean(maybeHasAlpha);
  }

  const safeW = Math.max(1, width || 100);
  const safeH = Math.max(1, height || 100);
  const pixels = safeW * safeH;
  const normFormat = (format || 'original').toLowerCase();

  let bytesPerPixelFloor: number;

  switch (normFormat) {
    case 'webp':
      // WebP has exceptionally high compression ratio at low quality
      bytesPerPixelFloor = 0.025;
      break;
    case 'jpg':
    case 'jpeg':
      // JPEG baseline compression floor
      bytesPerPixelFloor = 0.04;
      break;
    case 'png':
      // Lossless PNG baseline
      bytesPerPixelFloor = hasAlpha ? 0.12 : 0.08;
      break;
    default:
      bytesPerPixelFloor = 0.04;
      break;
  }

  // Calculate stream estimate + header overhead
  const headerOverhead = 512;
  let minFeasibleBytes = Math.ceil(pixels * bytesPerPixelFloor) + headerOverhead;

  // Clamped lower bound (at least 1 KB)
  minFeasibleBytes = Math.max(1024, minFeasibleBytes);

  // Cap against original file size if known
  if (originalSizeBytes && originalSizeBytes > 0) {
    if (minFeasibleBytes >= originalSizeBytes) {
      minFeasibleBytes = Math.max(512, Math.floor(originalSizeBytes * 0.15));
    } else if (minFeasibleBytes > originalSizeBytes * 0.85) {
      minFeasibleBytes = Math.max(512, Math.floor(originalSizeBytes * 0.8));
    }
  }

  return minFeasibleBytes;
}

/**
 * Calculates mathematical estimated reduction percentage.
 */
export function calculateImageReductionPercentage(originalBytes: number, targetBytes: number): number {
  if (originalBytes <= 0 || targetBytes >= originalBytes) {
    return 0;
  }
  const diff = originalBytes - targetBytes;
  return Math.max(0, Math.min(99.9, Math.round(((diff / originalBytes) * 100) * 10) / 10));
}
