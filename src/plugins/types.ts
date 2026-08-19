export interface SearchResult {
  id: string;
  name: string;
  author: string;
  iconUrl: string;
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
}

export interface ExporterPlugin extends BasePlugin {
  category: 'exporter';
  targetFormat: 'zip' | 'mrpack' | 'curseforge' | 'server';
  fileExtension: string;
}

export type AnyPlugin = SourcePlugin | ExporterPlugin;
