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
    dot: '#1bd96a',
    accent: '#1bd96a',
    accentHover: '#18c45e',
    soft: 'rgba(27, 217, 106, 0.12)',
    border: 'rgba(27, 217, 106, 0.28)',
    gradient: 'linear-gradient(135deg, #0e2a18 0%, #08160d 100%)',
    label: 'Modrinth',
    toggleClass: 'on',
  },
  curseforge: {
    dot: '#f16436',
    accent: '#f16436',
    accentHover: '#d95a30',
    soft: 'rgba(241, 100, 54, 0.12)',
    border: 'rgba(241, 100, 54, 0.28)',
    gradient: 'linear-gradient(135deg, #38190e 0%, #1e0d07 100%)',
    label: 'CurseForge',
    toggleClass: 'on-curseforge',
  },
  local: {
    dot: '#c49474',
    accent: '#c49474',
    accentHover: '#a37659',
    soft: 'rgba(196, 148, 116, 0.12)',
    border: 'rgba(196, 148, 116, 0.28)',
    gradient: 'linear-gradient(135deg, #2b1f17 0%, #17110c 100%)',
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
