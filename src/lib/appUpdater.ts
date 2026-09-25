import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type UpdateChannel = 'stable' | 'unstable';

export interface AppUpdateStatus {
  available: boolean;
  channel: string;
  current_version: string;
  version?: string;
  notes?: string;
  configured: boolean;
  message?: string;
}

export interface UpdateProgressPayload {
  chunk_length: number;
  downloaded: number;
  total?: number;
  percentage?: number;
}

export async function getUpdateChannel(): Promise<UpdateChannel> {
  const ch = await invoke<string>('get_update_channel');
  return ch === 'unstable' ? 'unstable' : 'stable';
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<UpdateChannel> {
  const ch = await invoke<string>('set_update_channel', { channel });
  return ch === 'unstable' ? 'unstable' : 'stable';
}

export async function checkAppUpdate(channel?: UpdateChannel): Promise<AppUpdateStatus> {
  return invoke<AppUpdateStatus>('check_app_update', { channel });
}

export async function installAppUpdate(channel?: UpdateChannel): Promise<void> {
  return invoke<void>('install_app_update', { channel });
}

export async function restartApp(): Promise<void> {
  return invoke<void>('restart_app');
}

export async function listenUpdateProgress(
  handler: (progress: UpdateProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<UpdateProgressPayload>('app-update-progress', event => {
    handler(event.payload);
  });
}
