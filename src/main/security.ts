import { session, BrowserWindow, app } from 'electron';
import { logger } from './utils/logger';

/**
 * Applies security configurations to Electron session and windows.
 */
export function applySecurityPolicies(mainWindow: BrowserWindow): void {
  const isDev = !app.isPackaged && (process.env['NODE_ENV'] === 'development' || Boolean(process.env['VITE_DEV_SERVER_URL']));

  // Prevent any navigation away from the application
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    // In dev mode, allow navigating to the local Vite dev server only
    if (isDev && navigationUrl.startsWith('http://localhost:5173')) {
      return;
    }
    logger.security('Blocked unauthorized navigation attempt to', navigationUrl);
    event.preventDefault();
  });

  // Deny all new window / popup requests
  mainWindow.webContents.setWindowOpenHandler((details) => {
    logger.security('Denied window open request to', details.url);
    return { action: 'deny' };
  });

  // Block webview creation
  mainWindow.webContents.on('will-attach-webview', (event) => {
    logger.security('Blocked will-attach-webview');
    event.preventDefault();
  });

  // Deny all device and sensory permissions (camera, microphone, geolocation, etc.)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    logger.security('Denied permission request for', permission);
    callback(false);
  });

  // Enforce Content Security Policy (CSP) headers on all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // In dev mode, allow local HMR websocket for Vite development; in production connect-src is strictly 'none'
    const connectSrc = isDev ? "connect-src 'self' ws://localhost:5173" : "connect-src 'none'";

    const cspDirectives = [
      "default-src 'self'",
      isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
      connectSrc,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['no-referrer']
      }
    });
  });

  // Disable DevTools in production
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }
}
