import { ModSource } from './types';

export interface SourceColorDef {
  dot: string;
  accent: string;
  accentHover: string;
  soft: string;
  label: string;
  toggleClass: string;
}

export const SOURCE_COLORS: Record<ModSource, SourceColorDef> = {
  modrinth: {
    dot: '#1bd96a',
    accent: '#1bd96a',
    accentHover: '#18c45e',
    soft: 'var(--modrinth-soft)',
    label: 'Modrinth',
    toggleClass: 'on',
  },
  curseforge: {
    dot: '#f16436',
    accent: '#f16436',
    accentHover: '#d95a30',
    soft: 'var(--curseforge-soft)',
    label: 'CurseForge',
    toggleClass: 'on-curseforge',
  },
  local: {
    dot: 'var(--local)',
    accent: 'var(--local)',
    accentHover: 'var(--local)',
    soft: 'var(--local-soft)',
    label: 'Local',
    toggleClass: 'on-local',
  },
};
