import type { Instance } from '../types';
import { checkPackUpdates } from './packUpdates';
import { appLog } from './appLog';

const STORAGE_KEY = 'packweaver_update_scan';
/** Modrinth is a shared resource and a pack can hold 400 mods; once a day is plenty. */
export const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ScanEntry {
  checkedAt: number;
  hasUpdate: boolean;
}

export type ScanCache = Record<string, ScanEntry>;

export function loadScanCache(): ScanCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ScanCache) : {};
  } catch {
    return {};
  }
}

export function saveScanCache(cache: ScanCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Private windows and cleared site data both land here; the scan simply
    // re-runs next launch rather than failing.
  }
}

/** Instances whose cached result is missing or older than `intervalMs`. */
export function instancesNeedingScan(
  instances: Instance[],
  cache: ScanCache,
  now: number,
  intervalMs: number = SCAN_INTERVAL_MS
): Instance[] {
  return instances.filter(i => {
    const entry = cache[i.id];
    return !entry || now - entry.checkedAt >= intervalMs;
  });
}

/** Apply cached results onto the instance list for rendering. */
export function applyScanCache(instances: Instance[], cache: ScanCache): Instance[] {
  return instances.map(i => {
    const entry = cache[i.id];
    if (!entry || entry.hasUpdate === i.hasUpdate) return i;
    return { ...i, hasUpdate: entry.hasUpdate };
  });
}

/**
 * Scan the given instances one at a time and report each result as it lands.
 * Sequential on purpose: a parallel sweep over several 400-mod packs is a burst
 * of hundreds of Modrinth calls.
 */
export async function scanForUpdates(
  instances: Instance[],
  onResult: (id: string, entry: ScanEntry) => void,
  isCancelled: () => boolean = () => false
): Promise<void> {
  for (const instance of instances) {
    if (isCancelled()) return;
    try {
      const result = await checkPackUpdates(instance);
      if (isCancelled()) return;
      onResult(instance.id, {
        checkedAt: Date.now(),
        hasUpdate: result.base.available || result.customs.length > 0,
      });
    } catch (e) {
      // A provider hiccup must not stop the remaining packs, and a badge is not
      // worth a toast; record the attempt so it is retried next interval.
      appLog('warn', 'updates', `Background scan failed for ${instance.id}: ${String(e)}`);
    }
  }
}
