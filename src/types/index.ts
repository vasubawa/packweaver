export type ModSource = 'modrinth' | 'curseforge' | 'local';
export type LoaderType = 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';

export interface CustomModItem {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: ModSource;
  isBase: boolean;
}

export interface ServerFileItem {
  name: string;
  type: 'config' | 'script';
  source: ModSource;
  enabled: boolean;
}

export interface ExportSettings {
  includeServer: boolean;
  version: string;
  format?: 'zip' | 'mrpack' | 'curseforge';
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
  basePackMods: string[];
  customMods: CustomModItem[];
  serverFiles: ServerFileItem[];
  exportSettings: ExportSettings;
}
