/** Shared formatting helpers for mod list columns. */

export function compareModName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function modMatchesQuery(
  mod: { name?: string; author?: string | null; fileName?: string | null; id?: string },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [mod.name, mod.author, mod.fileName, mod.id].some(v =>
    (v || '').toLowerCase().includes(q)
  );
}

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

/**
 * Modrinth project page for a mod, or `undefined` when there is nothing to link.
 *
 * Base mods imported from a local `.mrpack` carry the instance's `source`
 * ('local'), but their id is the real project id parsed out of the
 * `cdn.modrinth.com/data/{id}/...` download URL, so the 8-char shape is
 * accepted too. File-path ids (plain-zip scans) and `local-<uuid>` customs are
 * not project references and stay plain text.
 */
export function modrinthProjectUrl(mod: { id?: string; source?: string }): string | undefined {
  const id = (mod.id || '').trim();
  if (!id || id.startsWith('local-')) return undefined;
  if (/[\\/]/.test(id) || /\.(jar|zip|mrpack)$/i.test(id)) return undefined;

  const isProjectId = /^[A-Za-z0-9]{8}$/.test(id);
  if (mod.source !== 'modrinth' && !isProjectId) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(id)) return undefined;

  return `https://modrinth.com/mod/${encodeURIComponent(id)}`;
}

/** A mod list as shareable plain text: `Name  version  (author)  file.jar`. */
export function modListToText(
  mods: {
    name?: string;
    version?: string | null;
    author?: string | null;
    fileName?: string | null;
    id?: string;
    enabled?: boolean;
  }[],
  opts: { includeDisabled?: boolean } = {}
): string {
  const rows = mods.filter(m => opts.includeDisabled || m.enabled !== false);
  return rows
    .map(m => {
      const version = displayModVersion(m.version, m.fileName);
      const author = m.author ? ` by ${m.author}` : '';
      return `${m.name || m.id || 'unknown'} ${version}${author}`;
    })
    .join('\n');
}
