import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Generates a collision-safe destination file path that never overwrites the original.
 * Default pattern: `<base>_compressed.<ext>`
 * If that exists: `<base>_compressed_1.<ext>`, `<base>_compressed_2.<ext>`, etc.
 */
export function generateSafeDestinationPath(
  originalInputPath: string,
  targetDirectory?: string | null
): string {
  const parsed = path.parse(originalInputPath);
  const outputDir = targetDirectory ? path.resolve(targetDirectory) : parsed.dir;
  const baseName = parsed.name;
  const ext = parsed.ext || '.mp4';

  let candidate = path.join(outputDir, `${baseName}_compressed${ext}`);
  let counter = 1;

  // Never overwrite an existing file silently
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${baseName}_compressed_${counter}${ext}`);
    counter++;
  }

  return candidate;
}

/**
 * Atomically moves or safely copies + removes temporary output to final destination.
 * Validates file sizes match before unlinking temporary source.
 */
export async function atomicMove(tempSourcePath: string, finalDestPath: string): Promise<void> {
  if (!fs.existsSync(tempSourcePath)) {
    throw new Error('Temporary source file does not exist.');
  }

  const srcStat = await fs.promises.stat(tempSourcePath);
  if (srcStat.size === 0) {
    throw new Error('Compressed temporary file is empty (0 bytes).');
  }

  // Ensure target directory exists
  const destDir = path.dirname(finalDestPath);
  if (!fs.existsSync(destDir)) {
    await fs.promises.mkdir(destDir, { recursive: true });
  }

  // Attempt fast atomic rename (works on same drive partition)
  try {
    await fs.promises.rename(tempSourcePath, finalDestPath);
    logger.info('Moved output file atomically', finalDestPath);
    return;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    // EXDEV occurs when moving across different drive letters (e.g. C: to D:)
    if (error.code !== 'EXDEV') {
      logger.error('Failed to rename output file', error);
      throw error;
    }
  }

  // Cross-device fallback: copy, verify size, and then remove source
  logger.info('Performing cross-device safe copy to', finalDestPath);
  await fs.promises.copyFile(tempSourcePath, finalDestPath);
  const destStat = await fs.promises.stat(finalDestPath);

  if (destStat.size !== srcStat.size) {
    // Integrity check failed: remove partial destination and fail
    try {
      await fs.promises.unlink(finalDestPath);
    } catch {
      // Ignore
    }
    throw new Error('Cross-volume copy failed file integrity size check.');
  }

  // Cleanup source after verified copy
  try {
    await fs.promises.unlink(tempSourcePath);
  } catch (unlinkErr) {
    logger.warn('Failed to delete temp file after cross-device copy', unlinkErr);
  }
}
