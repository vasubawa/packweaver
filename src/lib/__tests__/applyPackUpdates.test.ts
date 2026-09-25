import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instance, InstanceMod } from '../../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { applyCustomModUpdates, applyOneCustomModUpdate } = await import('../applyPackUpdates');

function mod(over: Partial<InstanceMod> = {}): InstanceMod {
  return {
    id: 'sodium',
    name: 'Sodium',
    version: '0.5.8',
    source: 'modrinth',
    isBase: false,
    enabled: true,
    enabledServer: true,
    side: 'both',
    ...over,
  } as InstanceMod;
}

function instance(mods: InstanceMod[]): Instance {
  return { id: 'pack-a', customMods: mods } as Instance;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(1);
});

describe('applyCustomModUpdates', () => {
  it('is a no-op when nothing is pinned', async () => {
    const mods = [mod()];
    const result = await applyCustomModUpdates({
      instance: instance(mods),
      pins: [],
      serverOn: true,
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ updatedMods: mods, clientLayered: 0, serverLayered: 0 });
  });

  it('rewrites only the pinned mods and leaves the rest identical', async () => {
    const pinned = mod();
    const untouched = mod({ id: 'lithium', name: 'Lithium', version: '0.12.0' });

    const result = await applyCustomModUpdates({
      instance: instance([pinned, untouched]),
      pins: [{ modId: 'sodium', versionId: 'AbCdEfGh', versionNumber: '0.6.0' }],
      serverOn: false,
    });

    expect(result.updatedMods[0]).toMatchObject({
      id: 'sodium',
      version: '0.6.0',
      versionId: 'AbCdEfGh',
    });
    expect(result.updatedMods[1]).toBe(untouched);
  });

  it('skips the server layer pass when the server exporter is off', async () => {
    const result = await applyCustomModUpdates({
      instance: instance([mod()]),
      pins: [{ modId: 'sodium', versionId: 'AbCdEfGh', versionNumber: '0.6.0' }],
      serverOn: false,
    });

    const layerCalls = invoke.mock.calls.filter(c => c[0] === 'layer_custom_mods');
    expect(layerCalls).toHaveLength(1);
    expect(layerCalls[0][1]).toMatchObject({ forServer: false });
    expect(result.serverLayered).toBe(0);
  });

  // A server workspace that was never built is an expected state, not a failure
  // of the client update the user actually asked for.
  it('treats a missing server workspace as zero layered, not an error', async () => {
    invoke.mockImplementation((cmd: string, args: { forServer?: boolean }) => {
      if (cmd === 'layer_custom_mods' && args?.forServer) {
        return Promise.reject(new Error('Server workspace not found — rebuild server first'));
      }
      return Promise.resolve(3);
    });

    const result = await applyCustomModUpdates({
      instance: instance([mod()]),
      pins: [{ modId: 'sodium', versionId: 'AbCdEfGh', versionNumber: '0.6.0' }],
      serverOn: true,
    });

    expect(result).toMatchObject({ clientLayered: 3, serverLayered: 0 });
  });

  it('propagates a server layering failure that is not a missing workspace', async () => {
    invoke.mockImplementation((cmd: string, args: { forServer?: boolean }) => {
      if (cmd === 'layer_custom_mods' && args?.forServer) {
        return Promise.reject(new Error('disk full'));
      }
      return Promise.resolve(3);
    });

    await expect(
      applyCustomModUpdates({
        instance: instance([mod()]),
        pins: [{ modId: 'sodium', versionId: 'AbCdEfGh', versionNumber: '0.6.0' }],
        serverOn: true,
      })
    ).rejects.toThrow('disk full');
  });
});

describe('applyOneCustomModUpdate', () => {
  it('pins exactly the one mod it was given', async () => {
    await applyOneCustomModUpdate({
      instance: instance([mod(), mod({ id: 'lithium' })]),
      mod: mod(),
      latest: {
        versionId: 'AbCdEfGh',
        versionNumber: '0.6.0',
        gameVersions: ['1.21'],
        loaders: ['fabric'],
        primaryFilename: 'sodium-0.6.0.jar',
      },
      serverOn: false,
    });

    const pinCall = invoke.mock.calls.find(c => c[0] === 'update_custom_mod_versions');
    expect(pinCall?.[1]).toMatchObject({
      instanceId: 'pack-a',
      updates: [
        {
          modId: 'sodium',
          version: 'AbCdEfGh',
          versionNumber: '0.6.0',
          fileName: 'sodium-0.6.0.jar',
        },
      ],
    });
  });
});
