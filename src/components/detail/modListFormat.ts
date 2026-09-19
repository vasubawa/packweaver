/** Shared formatting helpers for mod list columns. */

export function jarLeaf(fileName?: string | null, fallbackId?: string): string {
  const raw = (fileName || fallbackId || '').replace(/\\/g, '/');
  if (!raw) return '—';
  return raw.split('/').pop() || raw;
}

export function formatBytes(n?: number | null): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Prefer human version; Modrinth version GUIDs (e.g. 2XUIKIAa) fall back to jar name. */
export function displayModVersion(version?: string | null, fileName?: string | null): string {
  const v = (version || '').trim();
  const looksLikeProviderId = /^[A-Za-z0-9]{8}$/.test(v);
  if (v && v !== 'latest' && v !== 'local' && v !== 'unknown' && !looksLikeProviderId) {
    return v;
  }
  const leaf = jarLeaf(fileName, '');
  const fromFile = leaf.match(/(\d+\.\d+(?:\.\d+)*(?:[+-][\w.]+)?)/);
  if (fromFile) return fromFile[1];
  return v || '—';
}
