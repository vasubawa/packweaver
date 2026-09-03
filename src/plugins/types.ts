export interface SearchResult {
  id: string;
  name: string;
  author: string;
  iconUrl: string;
  description?: string;
}

export interface PackVersionInfo {
  /** Provider-internal release ID (e.g. Modrinth's version GUID). Compare this when checking for updates. */
  versionId: string;
  /** Human-readable version label, e.g. "1.5.2". Display-only. */
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  changelog?: string | null;
  versionType?: string;
  publishDate?: string;
  downloadUrls?: string[];
  primaryFilename?: string;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  loaders?: string[];
  gameVersions?: string[];
  categories?: string[];
}

export interface ProjectDetails {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: string[];
  clientSide: string;
  serverSide: string;
  downloads: number;
  followers: number;
  published: string;
  updated: string;
  license: { id: string; name: string; url: string | null };
  issuesUrl: string | null;
  sourceUrl: string | null;
  discordUrl: string | null;
  iconUrl?: string | null;
  gallery: { url: string; featured: boolean; title: string | null; description: string | null }[];
}

export interface DependencyInfo {
  projectId: string | null;
  versionId: string | null;
  name?: string;
  version?: string;
  author?: string;
  iconUrl?: string | null;
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded' | string;
}

export interface VersionOptions {
  loaders?: string[];
  gameVersions?: string[];
  featured?: boolean;
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
  search?: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  // Searches individual mods rather than modpacks
  searchMods?: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  // Resolves the real, currently-published version of a project (pack or mod) —
  // used instead of ever showing/accepting a hand-picked "latest"
  getLatestVersion?: (projectId: string) => Promise<PackVersionInfo | null>;

  // Extended Features
  getTags?: (type: 'categories' | 'loaders' | 'game_versions') => Promise<string[]>;
  getProjectDetails?: (projectId: string) => Promise<ProjectDetails | null>;
  getVersions?: (projectId: string, options?: VersionOptions) => Promise<PackVersionInfo[]>;
  getDependencies?: (projectId: string, versionId?: string) => Promise<DependencyInfo[]>;
  identifyFileByHash?: (hash: string, algo: 'sha1' | 'sha512') => Promise<PackVersionInfo | null>;
}

export interface ExporterPlugin extends BasePlugin {
  category: 'exporter';
  targetFormat: 'zip' | 'mrpack' | 'curseforge' | 'server';
  fileExtension: string;
}

export type AnyPlugin = SourcePlugin | ExporterPlugin;
