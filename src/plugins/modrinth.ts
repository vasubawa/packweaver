import { SourcePlugin, SearchResult, PackVersionInfo } from './types';

async function searchByType(
  query: string,
  projectType: 'modpack' | 'mod',
  limit: number,
  offset: number
): Promise<SearchResult[]> {
  try {
    const facets = [[`project_type:${projectType}`]];

    const validLimit = Math.min(Math.max(1, limit), 100);
    const validOffset = Math.max(0, offset);

    const url = new URL('https://api.modrinth.com/v2/search');
    if (query) url.searchParams.append('query', query);
    url.searchParams.append('facets', JSON.stringify(facets));
    url.searchParams.append('limit', validLimit.toString());
    url.searchParams.append('offset', validOffset.toString());

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);

    const data = await res.json();
    return (data.hits || []).map((hit: any) => ({
      id: hit.slug || hit.project_id,
      name: hit.title,
      author: hit.author,
      iconUrl: hit.icon_url || '',
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const ModrinthPlugin: SourcePlugin = {
  id: 'modrinth',
  name: 'Modrinth',
  description: 'Search and download open-source modpacks and mods from Modrinth.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'source',
  enabled: true,
  builtIn: true,
  colors: {
    primary: '#1bd96a',
    primaryHover: '#16a34a',
    textClass: 'text-black',
    borderClass: 'border-[#1bd96a]/40 hover:border-[#1bd96a]',
  },
  iconUrl: '/modrinth.png',
  fallbackEmoji: '🧩',

  canSearch: true,
  search: (query, limit = 20, offset = 0) => searchByType(query, 'modpack', limit, offset),
  searchMods: (query, limit = 20, offset = 0) => searchByType(query, 'mod', limit, offset),

  getLatestVersion: async (projectId: string): Promise<PackVersionInfo | null> => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);

      const versions = await res.json();
      if (!Array.isArray(versions) || versions.length === 0) return null;

      // Modrinth returns versions newest-first
      const latest = versions[0];
      return {
        versionId: latest.id,
        versionNumber: latest.version_number || latest.name || 'unknown',
        gameVersions: latest.game_versions || [],
        loaders: latest.loaders || [],
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  },
};
