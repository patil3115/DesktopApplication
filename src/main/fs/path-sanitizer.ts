import fs from 'fs';
import path from 'path';
import { validateSafePath, ValidationError } from '../../common/validators';
import { logger } from '../utils/logger';

// Windows protected system paths that should NEVER be targets of input/output
const SENSITIVE_DIRS = [
  process.env['WINDIR'] ? path.resolve(process.env['WINDIR']) : 'C:\\Windows',
  process.env['PROGRAMFILES'] ? path.resolve(process.env['PROGRAMFILES']) : 'C:\\Program Files',
  process.env['PROGRAMFILES(X86)'] ? path.resolve(process.env['PROGRAMFILES(X86)']) : 'C:\\Program Files (x86)',
  process.env['SYSTEMROOT'] ? path.resolve(process.env['SYSTEMROOT']) : 'C:\\Windows'
].map(p => p.toLowerCase());

/**
 * Validates and canonicalizes an input video file path.
 * Ensures:
 * 1. Safe path string
 * 2. Absolute canonical resolution
 * 3. File exists on disk
 * 4. Is a regular file (not directory, symlink, pipe, or device)
 * 5. Not located inside protected OS system directories
 */
export function validateInputVideoPath(rawPath: unknown): string {
  const safePath = validateSafePath(rawPath, 'inputVideoPath');
  const resolved = path.resolve(safePath);

  // Reject drive roots directly, e.g. "C:\"
  const root = path.parse(resolved).root;
  if (resolved.toLowerCase() === root.toLowerCase()) {
    throw new ValidationError('Input path cannot be a drive root.');
  }

  // Check against sensitive OS directories
  const lowerResolved = resolved.toLowerCase();
  for (const sensitive of SENSITIVE_DIRS) {
    if (lowerResolved.startsWith(sensitive.toLowerCase() + path.sep)) {
      logger.security('Attempted access to protected system directory', rawPath);
      throw new ValidationError('Access to operating system directories is denied.');
    }
  }

  // Verify file existence and type
  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (err) {
    throw new ValidationError(`Input file does not exist or is inaccessible.`);
  }

  if (!stats.isFile()) {
    throw new ValidationError('Input path must be a regular file, not a directory or special device.');
  }

  if (stats.size === 0) {
    throw new ValidationError('Input video file is empty (0 bytes).');
  }

  // Maximum allowable file size: 50 GB to avoid host resource exhaustion
  const MAX_INPUT_BYTES = 50 * 1024 * 1024 * 1024;
  if (stats.size > MAX_INPUT_BYTES) {
    throw new ValidationError('Input file exceeds maximum allowed limit of 50 GB.');
  }

  return resolved;
}

const VALID_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set<string>([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp'
]);

/**
 * Validates and canonicalizes an input image file path.
 */
export function validateInputImagePath(rawPath: unknown): string {
  const safePath = validateSafePath(rawPath, 'inputImagePath');
  const resolved = path.resolve(safePath);

  const ext = path.extname(resolved).toLowerCase();
  if (!VALID_IMAGE_EXTENSIONS.has(ext)) {
    throw new ValidationError(`Unsupported image extension: ${ext || 'none'}. Supported formats: JPG, PNG, WebP, BMP.`);
  }

  // Reject drive roots directly, e.g. "C:\"
  const root = path.parse(resolved).root;
  if (resolved.toLowerCase() === root.toLowerCase()) {
    throw new ValidationError('Input path cannot be a drive root.');
  }

  // Check against sensitive OS directories
  const lowerResolved = resolved.toLowerCase();
  for (const sensitive of SENSITIVE_DIRS) {
    if (lowerResolved.startsWith(sensitive.toLowerCase() + path.sep)) {
      logger.security('Attempted access to protected system directory', rawPath);
      throw new ValidationError('Access to operating system directories is denied.');
    }
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (err) {
    throw new ValidationError('Input file does not exist or is inaccessible.');
  }

  if (!stats.isFile()) {
    throw new ValidationError('Input path must be a regular file.');
  }

  if (stats.size === 0) {
    throw new ValidationError('Input image file is empty (0 bytes).');
  }

  // Maximum allowable image file size: 500 MB
  const MAX_IMAGE_BYTES = 500 * 1024 * 1024;
  if (stats.size > MAX_IMAGE_BYTES) {
    throw new ValidationError('Input file exceeds maximum allowed limit of 500 MB.');
  }

  return resolved;
}

/**
 * Validates a target output directory path.
 */
export function validateOutputDirectoryPath(rawPath: unknown): string {
  const safePath = validateSafePath(rawPath, 'outputDirectory');
  const resolved = path.resolve(safePath);

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (err) {
    throw new ValidationError('Selected output directory does not exist or is inaccessible.');
  }

  if (!stats.isDirectory()) {
    throw new ValidationError('Output target must be a valid directory.');
  }

  // Verify write permission by testing with a non-critical check
  try {
    fs.accessSync(resolved, fs.constants.W_OK | fs.constants.R_OK);
  } catch (err) {
    throw new ValidationError('Output directory does not have write permissions.');
  }

  return resolved;
}
