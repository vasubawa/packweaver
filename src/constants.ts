import { ModSource } from './types';

export interface SourceColorDef {
  dot: string;
  accent: string;
  accentHover: string;
  soft: string;
  border: string;
  gradient: string;
  label: string;
  toggleClass: string;
}

export const SOURCE_COLORS: Record<ModSource, SourceColorDef> = {
  modrinth: {
    dot: 'var(--modrinth)',
    accent: 'var(--modrinth)',
    accentHover: 'var(--modrinth)',
    soft: 'var(--modrinth-soft)',
    border: 'var(--modrinth-border)',
    gradient: 'var(--modrinth-gradient)',
    label: 'Modrinth',
    toggleClass: 'on',
  },
  curseforge: {
    dot: 'var(--curseforge)',
    accent: 'var(--curseforge)',
    accentHover: 'var(--curseforge)',
    soft: 'var(--curseforge-soft)',
    border: 'var(--curseforge-border)',
    gradient: 'var(--curseforge-gradient)',
    label: 'CurseForge',
    toggleClass: 'on-curseforge',
  },
  local: {
    dot: 'var(--local)',
    accent: 'var(--local)',
    accentHover: 'var(--local)',
    soft: 'var(--local-soft)',
    border: 'var(--local-border)',
    gradient: 'var(--local-gradient)',
    label: 'Local Upload',
    toggleClass: 'on-local',
  },
};

export function formatBasePackName(basePack: string | undefined): string {
  if (!basePack) return 'Custom';
  // If it's a file path, extract the filename
  const cleaned = basePack.replace(/\\/g, '/');
  const filename = cleaned.split('/').pop();
  if (filename && filename.length > 0) {
    return filename;
  }
  return basePack;
}
