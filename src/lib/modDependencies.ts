import type { Instance, InstanceMod } from '../types';
import type { PackVersionInfo, VersionDependency } from '../plugins';

export interface MissingDependency {
  projectId: string;
  /** Filled in by the caller once the provider has been asked for a title. */
  name?: string;
}

/** Ids already present in a pack, base and custom alike. */
export function installedModIds(
  instance: Pick<Instance, 'basePackMods' | 'customMods'>
): Set<string> {
  const ids = new Set<string>();
  for (const m of [...instance.basePackMods, ...instance.customMods]) {
    const id = (m.id || '').trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/**
 * Required dependencies of `version` that the pack does not already contain.
 *
 * Only `required` counts — `optional`, `embedded` (shaded into the jar) and
 * `incompatible` must not be installed on the user's behalf. A dependency
 * naming no project (a loose version pin) cannot be resolved, so it is skipped
 * rather than reported as a phantom missing mod.
 */
export function missingRequiredDependencies(
  version: Pick<PackVersionInfo, 'dependencies'> | null | undefined,
  installed: Set<string>
): MissingDependency[] {
  const deps: VersionDependency[] = version?.dependencies ?? [];
  const seen = new Set<string>();
  const missing: MissingDependency[] = [];

  for (const dep of deps) {
    if (dep.dependencyType !== 'required') continue;
    const projectId = (dep.projectId || '').trim();
    if (!projectId) continue;
    const key = projectId.toLowerCase();
    if (installed.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push({ projectId });
  }
  return missing;
}

/** Mods already in the pack that this version declares incompatible. */
export function conflictingMods(
  version: Pick<PackVersionInfo, 'dependencies'> | null | undefined,
  mods: InstanceMod[]
): InstanceMod[] {
  const blocked = new Set(
    (version?.dependencies ?? [])
      .filter(d => d.dependencyType === 'incompatible' && d.projectId)
      .map(d => (d.projectId as string).toLowerCase())
  );
  if (blocked.size === 0) return [];
  return mods.filter(m => blocked.has((m.id || '').toLowerCase()));
}
