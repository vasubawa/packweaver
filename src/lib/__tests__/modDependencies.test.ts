import { describe, it, expect } from 'vitest';
import type { Instance, InstanceMod } from '../../types';
import { installedModIds, missingRequiredDependencies, conflictingMods } from '../modDependencies';

function mod(id: string, name = id): InstanceMod {
  return { id, name, enabled: true } as InstanceMod;
}

const pack = {
  basePackMods: [mod('fabric-api', 'Fabric API')],
  customMods: [mod('sodium', 'Sodium')],
} as Pick<Instance, 'basePackMods' | 'customMods'>;

describe('installedModIds', () => {
  it('collects base and custom ids, case-insensitively', () => {
    const ids = installedModIds({
      basePackMods: [mod('Fabric-API')],
      customMods: [mod('SODIUM')],
    } as Pick<Instance, 'basePackMods' | 'customMods'>);
    expect(ids.has('fabric-api')).toBe(true);
    expect(ids.has('sodium')).toBe(true);
  });
});

describe('missingRequiredDependencies', () => {
  const installed = installedModIds(pack);

  it('reports a required dependency the pack does not have', () => {
    const missing = missingRequiredDependencies(
      {
        dependencies: [{ projectId: 'cloth-config', versionId: null, dependencyType: 'required' }],
      },
      installed
    );
    expect(missing).toEqual([{ projectId: 'cloth-config' }]);
  });

  it('ignores a required dependency that is already installed', () => {
    const missing = missingRequiredDependencies(
      { dependencies: [{ projectId: 'fabric-api', versionId: null, dependencyType: 'required' }] },
      installed
    );
    expect(missing).toEqual([]);
  });

  // Installing these on the user's behalf would be wrong: optional is a choice,
  // embedded is already inside the jar, incompatible must NOT be added.
  it('ignores optional, embedded and incompatible entries', () => {
    const missing = missingRequiredDependencies(
      {
        dependencies: [
          { projectId: 'a', versionId: null, dependencyType: 'optional' },
          { projectId: 'b', versionId: null, dependencyType: 'embedded' },
          { projectId: 'c', versionId: null, dependencyType: 'incompatible' },
        ],
      },
      installed
    );
    expect(missing).toEqual([]);
  });

  it('skips a dependency that names no project', () => {
    const missing = missingRequiredDependencies(
      {
        dependencies: [
          { projectId: null, versionId: 'xxxxxxxx', dependencyType: 'required' },
          { projectId: '  ', versionId: null, dependencyType: 'required' },
        ],
      },
      installed
    );
    expect(missing).toEqual([]);
  });

  it('de-duplicates repeated entries', () => {
    const missing = missingRequiredDependencies(
      {
        dependencies: [
          { projectId: 'cloth-config', versionId: null, dependencyType: 'required' },
          { projectId: 'Cloth-Config', versionId: null, dependencyType: 'required' },
        ],
      },
      installed
    );
    expect(missing).toHaveLength(1);
  });

  it('handles a version with no dependency data at all', () => {
    expect(missingRequiredDependencies(null, installed)).toEqual([]);
    expect(missingRequiredDependencies({ dependencies: undefined }, installed)).toEqual([]);
  });
});

describe('conflictingMods', () => {
  it('finds installed mods the version declares incompatible', () => {
    const conflicts = conflictingMods(
      { dependencies: [{ projectId: 'sodium', versionId: null, dependencyType: 'incompatible' }] },
      [mod('sodium', 'Sodium'), mod('lithium', 'Lithium')]
    );
    expect(conflicts.map(m => m.name)).toEqual(['Sodium']);
  });

  it('returns nothing when the version declares no conflicts', () => {
    expect(conflictingMods({ dependencies: [] }, [mod('sodium')])).toEqual([]);
  });
});
