import { Instance, InstanceMod } from '../types';
import { getActiveSourcePlugins, PackVersionInfo } from '../plugins';

export interface BaseUpdateInfo {
  available: boolean;
  currentLabel: string;
  latest: PackVersionInfo | null;
}

export interface CustomUpdateInfo {
  mod: InstanceMod;
  currentLabel: string;
  latest: PackVersionInfo;
}

export interface UpdateCheckResult {
  checkedAt: number;
  base: BaseUpdateInfo;
  customs: CustomUpdateInfo[];
  skippedNonModrinth: number;
}

export function loaderFacet(loader: string): string {
  return loader.trim().toLowerCase();
}

function looksLikeVersionId(v: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(v.trim());
}

function isNewer(current: string, latest: PackVersionInfo): boolean {
  const cur = current.trim();
  if (!cur || cur === 'latest' || cur === 'local' || cur === 'unknown') return true;
  if (looksLikeVersionId(cur)) return cur !== latest.versionId;
  return cur !== latest.versionNumber;
}

async function resolveCurrentLabel(versionRef: string): Promise<string> {
  if (!versionRef) return 'unknown';
  if (!looksLikeVersionId(versionRef)) return versionRef;
  try {
    const res = await fetch(`https://api.modrinth.com/v2/version/${versionRef}`);
    if (!res.ok) return versionRef;
    const data = await res.json();
    return data.version_number || versionRef;
  } catch {
    return versionRef;
  }
}

/** Scan Modrinth for newer base pack + custom mod versions. Local/CF customs skipped. */
export async function checkPackUpdates(instance: Instance): Promise<UpdateCheckResult> {
  const sources = getActiveSourcePlugins();
  const modrinth = sources.find(s => s.id === 'modrinth');
  const empty: UpdateCheckResult = {
    checkedAt: Date.now(),
    base: { available: false, currentLabel: instance.basePackVersion || 'unknown', latest: null },
    customs: [],
    skippedNonModrinth: 0,
  };
  if (!modrinth?.getLatestVersion) return empty;
  const getLatestVersion = modrinth.getLatestVersion;
  const getVersions = modrinth.getVersions;

  const versionOpts = {
    gameVersions: instance.mcVersion ? [instance.mcVersion] : undefined,
    loaders: instance.loader ? [loaderFacet(instance.loader)] : undefined,
  };

  let baseLatest: PackVersionInfo | null = null;
  if (instance.source === 'modrinth' && instance.basePack) {
    if (getVersions) {
      const matched = await getVersions(instance.basePack, versionOpts);
      baseLatest = matched[0] ?? null;
    }
    if (!baseLatest) {
      baseLatest = await getLatestVersion(instance.basePack);
    }
  }

  const currentBaseLabel = await resolveCurrentLabel(instance.basePackVersion || '');
  const baseAvailable =
    !!baseLatest &&
    instance.source === 'modrinth' &&
    isNewer(instance.basePackVersion || '', baseLatest);

  const customs: CustomUpdateInfo[] = [];
  let skippedNonModrinth = 0;

  const modrinthCustoms = instance.customMods.filter(mod => {
    if (mod.source !== 'modrinth') {
      skippedNonModrinth += 1;
      return false;
    }
    return true;
  });

  const CONCURRENCY = 4;
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, modrinthCustoms.length) },
    async () => {
      while (nextIndex < modrinthCustoms.length) {
        const idx = nextIndex++;
        const mod = modrinthCustoms[idx];
        let latest: PackVersionInfo | null = null;
        if (getVersions) {
          const matched = await getVersions(mod.id, versionOpts);
          latest = matched[0] ?? null;
        }
        if (!latest) latest = await getLatestVersion(mod.id);
        if (!latest) continue;
        if (isNewer(mod.version || '', latest)) {
          customs.push({
            mod,
            currentLabel: mod.version || 'unknown',
            latest,
          });
        }
      }
    }
  );
  await Promise.all(workers);

  return {
    checkedAt: Date.now(),
    base: {
      available: baseAvailable,
      currentLabel: currentBaseLabel,
      latest: baseLatest,
    },
    customs,
    skippedNonModrinth,
  };
}
