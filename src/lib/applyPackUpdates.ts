import { invoke } from '@tauri-apps/api/core';
import { Instance, InstanceMod } from '../types';
import type { PackVersionInfo } from '../plugins';

export type CustomModPin = {
  modId: string;
  versionId: string;
  versionNumber: string;
  fileName?: string;
};

export type ApplyBaseResult = {
  versionId: string;
  versionNumber: string;
  serverRebuilt: boolean;
  serverWarning?: string;
};

export type ApplyCustomsResult = {
  updatedMods: InstanceMod[];
  clientLayered: number;
  serverLayered: number;
};

async function layerClient(instanceId: string): Promise<number> {
  return invoke<number>('layer_custom_mods', { instanceId, forServer: false });
}

async function layerServerIfPresent(instanceId: string, serverOn: boolean): Promise<number> {
  if (!serverOn) return 0;
  try {
    return await invoke<number>('layer_custom_mods', { instanceId, forServer: true });
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (msg.includes('not found') || msg.includes('rebuild server')) return 0;
    throw e;
  }
}

/**
 * Pin Base Pack version, rebuild client workspace, optionally rebuild server.
 * Owns the full apply sequence so UI callers stay thin.
 */
export async function applyBasePackUpdate(args: {
  instanceId: string;
  latest: PackVersionInfo;
  serverOn: boolean;
}): Promise<ApplyBaseResult> {
  const { instanceId, latest, serverOn } = args;
  await invoke('set_base_pack_version', {
    instanceId,
    versionId: latest.versionId,
    versionLabel: latest.versionNumber,
  });
  await invoke('rebuild_workspace', { instanceId });

  let serverRebuilt = false;
  let serverWarning: string | undefined;
  if (serverOn) {
    try {
      await invoke('rebuild_server_workspace', { instanceId });
      serverRebuilt = true;
    } catch (e) {
      serverWarning = String(e);
    }
  }

  return {
    versionId: latest.versionId,
    versionNumber: latest.versionNumber,
    serverRebuilt,
    serverWarning,
  };
}

/**
 * Pin Custom Mod versions, then layer client (+ server when present).
 */
export async function applyCustomModUpdates(args: {
  instance: Instance;
  pins: CustomModPin[];
  serverOn: boolean;
}): Promise<ApplyCustomsResult> {
  const { instance, pins, serverOn } = args;
  if (pins.length === 0) {
    return { updatedMods: instance.customMods, clientLayered: 0, serverLayered: 0 };
  }

  await invoke('update_custom_mod_versions', {
    instanceId: instance.id,
    updates: pins.map(p => ({
      modId: p.modId,
      version: p.versionId,
      versionNumber: p.versionNumber,
      fileName: p.fileName,
    })),
  });

  const updatedMods = instance.customMods.map(m => {
    const hit = pins.find(p => p.modId === m.id);
    if (!hit) return m;
    return {
      ...m,
      version: hit.versionNumber,
      versionId: hit.versionId,
      fileName: hit.fileName || m.fileName,
    };
  });

  const clientLayered = await layerClient(instance.id);
  const serverLayered = await layerServerIfPresent(instance.id, serverOn);

  return { updatedMods, clientLayered, serverLayered };
}

/** Single Custom Mod update — same path as batch. */
export async function applyOneCustomModUpdate(args: {
  instance: Instance;
  mod: InstanceMod;
  latest: PackVersionInfo;
  serverOn: boolean;
}): Promise<ApplyCustomsResult> {
  return applyCustomModUpdates({
    instance: args.instance,
    serverOn: args.serverOn,
    pins: [
      {
        modId: args.mod.id,
        versionId: args.latest.versionId,
        versionNumber: args.latest.versionNumber,
        fileName: args.latest.primaryFilename || undefined,
      },
    ],
  });
}
