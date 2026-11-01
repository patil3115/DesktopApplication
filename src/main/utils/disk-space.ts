import fs from 'fs';
import path from 'path';
import { logger } from './logger';

/**
 * Checks if target drive has sufficient free space.
 * Enforces a safety multiplier of 1.2x of the input file size.
 */
export async function verifySufficientDiskSpace(
  targetPath: string,
  requiredSizeBytes: number
): Promise<{ sufficient: boolean; availableBytes: number; requiredBytes: number }> {
  try {
    const dirToCheck = fs.existsSync(targetPath)
      ? fs.statSync(targetPath).isDirectory()
        ? targetPath
        : path.dirname(targetPath)
      : path.dirname(targetPath);

    const stats = await fs.promises.statfs(dirToCheck);
    const availableBytes = stats.bavail * stats.bsize;
    const requiredBytes = Math.ceil(requiredSizeBytes * 1.2);

    const sufficient = availableBytes >= requiredBytes;
    if (!sufficient) {
      logger.warn(
        `Insufficient disk space: available ${Math.round(availableBytes / (1024 * 1024))}MB, needed ${Math.round(requiredBytes / (1024 * 1024))}MB`
      );
    }

    return {
      sufficient,
      availableBytes,
      requiredBytes
    };
  } catch (err) {
    logger.warn('Could not query filesystem stats via statfs', err);
    // If statfs fails on a specific partition, allow graceful progression with warning
    return {
      sufficient: true,
      availableBytes: Number.MAX_SAFE_INTEGER,
      requiredBytes: requiredSizeBytes
    };
  }
}
