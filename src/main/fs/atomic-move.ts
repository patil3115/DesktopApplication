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

export interface FolderDestinationOptions {
  /** Desired output format/extension for format conversion (e.g. 'webp', 'jpg', 'png', or 'original') */
  outputFormat?: string;
}

/**
 * Generates a collision-safe destination file path for folder-based media compression.
 * 
 * Rules:
 * 1. Preserves exact original filename and extension when keeping original format.
 * 2. Preserves complete relative directory hierarchy from sourceRootDir to targetOutputDir.
 * 3. Never appends `_compressed`, `_converted`, or other suffixes.
 * 4. When converting format, updates the extension to the new format (e.g. photo1.png -> photo1.webp).
 * 5. Handles existing destination collisions deterministically using numbered alternatives:
 *    photo.jpg -> photo (1).jpg -> photo (2).jpg
 * 6. Supports a claimedPaths set to prevent intra-batch collisions when multiple source files
 *    map to the same destination filename (e.g. photo1.jpg and photo1.png both converted to webp).
 * 7. Never silently overwrites an existing file.
 */
export function generateFolderSafeDestinationPath(
  sourceFilePath: string,
  sourceRootDir: string,
  targetOutputDir: string,
  options?: FolderDestinationOptions,
  claimedPaths?: Set<string>
): string {
  const resolvedSourceRoot = path.resolve(sourceRootDir);
  const resolvedTargetRoot = path.resolve(targetOutputDir);
  const resolvedSourceFile = path.resolve(sourceFilePath);

  // Compute relative path from source root
  const relPath = path.relative(resolvedSourceRoot, resolvedSourceFile);
  const relDir = path.dirname(relPath);

  const parsed = path.parse(resolvedSourceFile);
  const baseName = parsed.name;
  let ext = parsed.ext;

  // Handle format conversion if specified and not 'original'
  if (options?.outputFormat && options.outputFormat.toLowerCase() !== 'original') {
    const rawFmt = options.outputFormat.toLowerCase().replace(/^\./, '');
    ext = `.${rawFmt === 'jpeg' ? 'jpg' : rawFmt}`;
  }

  // Ensure target subdirectory path
  const targetSubDir = relDir === '.' || !relDir ? resolvedTargetRoot : path.join(resolvedTargetRoot, relDir);

  // Primary candidate: exact original filename + extension (or converted extension)
  let candidate = path.join(targetSubDir, `${baseName}${ext}`);
  let counter = 1;

  const isCollision = (p: string): boolean => {
    return fs.existsSync(p) || (claimedPaths ? claimedPaths.has(p.toLowerCase()) : false);
  };

  while (isCollision(candidate)) {
    candidate = path.join(targetSubDir, `${baseName} (${counter})${ext}`);
    counter++;
  }

  if (claimedPaths) {
    claimedPaths.add(candidate.toLowerCase());
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
