import { convertFileSrc } from '@tauri-apps/api/core';

/** Resolve pack icon/banner for <img> / CSS — http(s) stay as-is; local disk paths use Tauri asset protocol. */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url || !url.trim()) return undefined;
  const u = url.trim();
  if (/^(https?:|data:|asset:|blob:|tauri:)/i.test(u)) return u;
  // App-bundled / public assets
  if (u.startsWith('/') && !u.startsWith('//') && !/^[a-zA-Z]:[\\/]/.test(u)) return u;
  try {
    return convertFileSrc(u);
  } catch {
    return u;
  }
}

/**
 * Wrap a resolved media URL for use inside a CSS `url(...)` token.
 * A third-party banner URL containing `)` or a quote would otherwise close the
 * token early and inject arbitrary CSS into the shorthand.
 */
export function cssUrl(url?: string | null): string | undefined {
  const resolved = mediaUrl(url);
  if (!resolved) return undefined;
  if (/[\n\r]/.test(resolved)) return undefined;
  const escaped = resolved.replace(/["\\]/g, m => `\\${m}`);
  return `url("${escaped}")`;
}
