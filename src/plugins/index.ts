import { ModrinthPlugin } from './modrinth';
import { CurseForgePlugin } from './curseforge';
import { LocalPlugin } from './local';
import { SourcePlugin } from './types';

export const PLUGINS: Record<string, SourcePlugin> = {
  modrinth: ModrinthPlugin,
  curseforge: CurseForgePlugin,
  local: LocalPlugin,
};

export * from './types';
