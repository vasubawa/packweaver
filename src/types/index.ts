export type ModSource = 'modrinth' | 'curseforge' | 'local';
export type LoaderType = 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';

export interface InstanceMod {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  enabledServer?: boolean;
  side?: string;
  source: ModSource;
  isBase: boolean;
  iconUrl?: string;
  author?: string;
  description?: string;
  fileName?: string;
  onDiskClient?: boolean;
  onDiskServer?: boolean;
  fileSize?: number | null;
}

export interface ServerFileItem {
  id: string;
  name: string;
  type: 'config' | 'script';
  source: ModSource;
  enabled: boolean;
}

export interface ExportSettings {
  includeServer: boolean;
  version: string;
  format?: 'zip' | 'server';
  targetDistribution?: string;
  exportPath?: string;
}

export interface Instance {
  id: string;
  name: string;
  source: ModSource;
  description: string;
  basePack: string;
  basePackVersion: string;
  mcVersion: string;
  loader: LoaderType;
  customModCount: number;
  totalModCount: number;
  status: string;
  progress?: number;
  total?: number;
  lastExported: string;
  fileSize: string;
  hasUpdate: boolean;
  bannerGradient?: string;
  bannerUrl?: string;
  iconUrl?: string;
  basePackMods: InstanceMod[];
  customMods: InstanceMod[];
  serverFiles: ServerFileItem[];
  exportSettings: ExportSettings;
}
