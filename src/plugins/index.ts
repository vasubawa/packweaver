import { ModrinthPlugin } from './modrinth';
import { CurseForgePlugin } from './curseforge';
import { LocalPlugin } from './local';
import { MrpackExporterPlugin } from './exporters/mrpack';
import { ZipExporterPlugin } from './exporters/zip';
import { ServerPackExporterPlugin } from './exporters/server';
import { AnyPlugin, SourcePlugin, ExporterPlugin, PluginCategory } from './types';

const INITIAL_PLUGINS: Record<string, AnyPlugin> = {
  modrinth: ModrinthPlugin,
  curseforge: CurseForgePlugin,
  local: LocalPlugin,
  mrpack_exporter: MrpackExporterPlugin,
  zip_exporter: ZipExporterPlugin,
  server_pack_exporter: ServerPackExporterPlugin,
};

const STORAGE_KEY = 'packweaver_plugin_settings';

export function getPluginSettings(): Record<string, { enabled: boolean; apiKey?: string }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePluginSetting(id: string, setting: { enabled?: boolean; apiKey?: string }) {
  const plugin = INITIAL_PLUGINS[id];
  if (plugin?.isCore && setting.enabled === false) {
    return; // Core features cannot be disabled
  }
  const current = getPluginSettings();
  current[id] = { ...current[id], ...setting };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event('packweaver_plugins_changed'));
}

export function getAllPlugins(): AnyPlugin[] {
  const settings = getPluginSettings();
  return Object.values(INITIAL_PLUGINS).map(p => {
    const s = settings[p.id];
    return {
      ...p,
      enabled: p.isCore ? true : s && typeof s.enabled === 'boolean' ? s.enabled : p.enabled,
      apiKey: s && s.apiKey ? s.apiKey : p.apiKey,
    } as AnyPlugin;
  });
}

export function getPluginsByCategory(category: PluginCategory): AnyPlugin[] {
  return getAllPlugins().filter(p => p.category === category);
}

export function getActiveSourcePlugins(): SourcePlugin[] {
  return getAllPlugins().filter((p): p is SourcePlugin => p.category === 'source' && p.enabled);
}

export function getActiveExporterPlugins(): ExporterPlugin[] {
  return getAllPlugins().filter((p): p is ExporterPlugin => p.category === 'exporter' && p.enabled);
}

export const PLUGINS: Record<string, SourcePlugin> = {
  modrinth: ModrinthPlugin,
  curseforge: CurseForgePlugin,
  local: LocalPlugin,
};

export * from './types';
