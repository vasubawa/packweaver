export interface SearchResult {
  id: string;
  name: string;
  author: string;
  iconUrl: string;
}

export interface PackVersionInfo {
  /** Provider-internal release ID (e.g. Modrinth's version GUID). Compare this when checking for updates. */
  versionId: string;
  /** Human-readable version label, e.g. "1.5.2". Display-only. */
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
}

export type PluginCategory = 'source' | 'exporter' | 'theme';

export interface BasePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: PluginCategory;
  enabled: boolean;
  builtIn?: boolean;
  isCore?: boolean;
  iconUrl?: string;
  fallbackEmoji: string;
  requiresApiKey?: boolean;
  apiKey?: string;
}

export interface SourcePlugin extends BasePlugin {
  category: 'source';
  // Brand Assets
  colors: {
    primary: string; // Hex color for backgrounds
    primaryHover: string; // Hex color for hovers
    textClass: string; // Tailwind class like 'text-black' or 'text-white'
    borderClass: string; // Tailwind class
  };
  // Capabilities
  canSearch: boolean;
  search?: (query: string, limit?: number, offset?: number) => Promise<SearchResult[]>;
  // Searches individual mods rather than modpacks
  searchMods?: (query: string, limit?: number, offset?: number) => Promise<SearchResult[]>;
  // Resolves the real, currently-published version of a project (pack or mod) —
  // used instead of ever showing/accepting a hand-picked "latest"
  getLatestVersion?: (projectId: string) => Promise<PackVersionInfo | null>;
}

export interface ExporterPlugin extends BasePlugin {
  category: 'exporter';
  targetFormat: 'zip' | 'mrpack' | 'curseforge' | 'server';
  fileExtension: string;
}

export type AnyPlugin = SourcePlugin | ExporterPlugin;
