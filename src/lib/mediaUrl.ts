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
