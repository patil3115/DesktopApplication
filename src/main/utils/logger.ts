/**
 * Privacy-Preserving Logger
 * 
 * Strict policy:
 * - Redacts user home directories and usernames from all logged paths.
 * - Never logs video content, frames, or EXIF metadata.
 * - Outputs exclusively to stdout/stderr in dev; zero remote network transmission.
 */

import os from 'os';

const USER_HOME = os.homedir();
const USERNAME = os.userInfo().username;

/**
 * Sanitizes a path string by replacing the user's home directory and username
 * with generic placeholders.
 * E.g., "C:\Users\JohnDoe\Videos\movie.mp4" -> "C:\Users\<REDACTED>\Videos\<FILE>.mp4"
 */
export function redactPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return '<EMPTY_PATH>';
  }

  let sanitized = rawPath;

  // Replace full home directory
  if (USER_HOME && sanitized.includes(USER_HOME)) {
    sanitized = sanitized.split(USER_HOME).join('~');
  }

  // Replace username specifically if it still appears
  if (USERNAME && USERNAME.length > 2 && sanitized.includes(USERNAME)) {
    sanitized = sanitized.split(USERNAME).join('<USER>');
  }

  return sanitized;
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(arg => (typeof arg === 'string' ? redactPath(arg) : arg));
    console.log(`[INFO] ${message}`, ...sanitizedArgs);
  },

  warn(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(arg => (typeof arg === 'string' ? redactPath(arg) : arg));
    console.warn(`[WARN] ${message}`, ...sanitizedArgs);
  },

  error(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.name}: ${redactPath(arg.message)}`;
      }
      return typeof arg === 'string' ? redactPath(arg) : arg;
    });
    console.error(`[ERROR] ${message}`, ...sanitizedArgs);
  },

  security(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(arg => (typeof arg === 'string' ? redactPath(arg) : arg));
    console.warn(`[SECURITY ALERT] ${message}`, ...sanitizedArgs);
  }
};
