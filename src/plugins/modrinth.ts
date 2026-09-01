import {
  SourcePlugin,
  SearchResult,
  PackVersionInfo,
  SearchOptions,
  ProjectDetails,
  DependencyInfo,
  VersionOptions,
} from './types';

async function searchByType(
  query: string,
  projectType: 'modpack' | 'mod',
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  try {
    const { limit = 20, offset = 0, loaders, gameVersions, categories } = options;
    const facets = [[`project_type:${projectType}`]];

    if (loaders && loaders.length > 0) {
      facets.push(loaders.map(l => `categories:${l}`));
    }
    if (gameVersions && gameVersions.length > 0) {
      facets.push(gameVersions.map(v => `versions:${v}`));
    }
    if (categories && categories.length > 0) {
      facets.push(categories.map(c => `categories:${c}`));
    }

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
  version: '1.1.0',
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
  search: (query, options) => searchByType(query, 'modpack', options),
  searchMods: (query, options) => searchByType(query, 'mod', options),

  getLatestVersion: async (projectId: string): Promise<PackVersionInfo | null> => {
    const versions = await ModrinthPlugin.getVersions!(projectId, { featured: true });
    if (versions.length > 0) return versions[0];

    // Fallback if no featured versions
    const allVersions = await ModrinthPlugin.getVersions!(projectId);
    return allVersions.length > 0 ? allVersions[0] : null;
  },

  getTags: async type => {
    try {
      const url = `https://api.modrinth.com/v2/tag/${type === 'game_versions' ? 'game_version' : type}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);
      const data = await res.json();

      if (type === 'game_versions') {
        return data
          .filter((v: any) => v.version_type === 'release' && v.major)
          .map((v: any) => v.version);
      }
      return data.map((t: any) => t.name);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  getProjectDetails: async (projectId: string): Promise<ProjectDetails | null> => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);
      const data = await res.json();

      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        description: data.description,
        body: data.body,
        categories: data.categories || [],
        clientSide: data.client_side,
        serverSide: data.server_side,
        downloads: data.downloads,
        followers: data.followers,
        published: data.published,
        updated: data.updated,
        license: data.license,
        issuesUrl: data.issues_url,
        sourceUrl: data.source_url,
        discordUrl: data.discord_url,
        iconUrl: data.icon_url,
        gallery: data.gallery || [],
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  getVersions: async (
    projectId: string,
    options: VersionOptions = {}
  ): Promise<PackVersionInfo[]> => {
    try {
      const url = new URL(`https://api.modrinth.com/v2/project/${projectId}/version`);
      if (options.loaders && options.loaders.length > 0) {
        url.searchParams.append('loaders', JSON.stringify(options.loaders));
      }
      if (options.gameVersions && options.gameVersions.length > 0) {
        url.searchParams.append('game_versions', JSON.stringify(options.gameVersions));
      }
      if (options.featured) {
        url.searchParams.append('featured', 'true');
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);

      const data = await res.json();
      return (data || []).map((v: any) => {
        const primaryFile = v.files?.find((f: any) => f.primary) || v.files?.[0];
        return {
          versionId: v.id,
          versionNumber: v.version_number || v.name || 'unknown',
          gameVersions: v.game_versions || [],
          loaders: v.loaders || [],
          changelog: v.changelog,
          versionType: v.version_type,
          publishDate: v.date_published,
          downloadUrls: v.files?.map((f: any) => f.url) || [],
          primaryFilename: primaryFile?.filename,
        };
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  getDependencies: async (projectId: string): Promise<DependencyInfo[]> => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/dependencies`);
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);

      const data = await res.json();
      const allDeps: DependencyInfo[] = [];

      for (const p of data.projects || []) {
        allDeps.push({
          projectId: p.id,
          versionId: null,
          name: p.title,
          iconUrl: p.icon_url,
          dependencyType: 'required',
        });
      }
      for (const v of data.versions || []) {
        const existing = allDeps.find(d => d.projectId === v.project_id);
        if (existing) {
          existing.versionId = v.id;
        } else {
          allDeps.push({
            projectId: v.project_id,
            versionId: v.id,
            name: v.project_id, // If project metadata is missing, use ID as fallback
            dependencyType: 'required',
          });
        }
      }
      const versionIds = allDeps.map(d => d.versionId).filter(Boolean) as string[];
      if (versionIds.length > 0) {
        try {
          // Fetch version data (for version number)
          const vRes = await fetch(
            `https://api.modrinth.com/v2/versions?ids=${encodeURIComponent(JSON.stringify(versionIds))}`
          );
          if (vRes.ok) {
            const vData = await vRes.json();
            const versionMap = new Map(vData.map((v: any) => [v.id, v]));
            for (const dep of allDeps) {
              if (dep.versionId && versionMap.has(dep.versionId)) {
                const vInfo = versionMap.get(dep.versionId) as any;
                if (vInfo) {
                  dep.version = vInfo.version_number;
                }
              }
            }
          }

          // We intentionally skip fetching Modrinth project data for authors because Modrinth
          // project objects do not contain human-readable authors (only team IDs).
          // We will leave dep.author undefined so that the backend JAR scanner can populate it
          // with the real author from fabric.mod.json when the download completes.
        } catch (e) {
          console.error('Failed to bulk fetch extra Modrinth data', e);
        }
      }

      return allDeps;
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  identifyFileByHash: async (
    hash: string,
    algo: 'sha1' | 'sha512'
  ): Promise<PackVersionInfo | null> => {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/version_file/${hash}?algorithm=${algo}`);
      if (!res.ok) throw new Error(`Modrinth API error: ${res.statusText}`);

      const v = await res.json();
      const primaryFile = v.files?.find((f: any) => f.primary) || v.files?.[0];
      return {
        versionId: v.id,
        versionNumber: v.version_number || v.name || 'unknown',
        gameVersions: v.game_versions || [],
        loaders: v.loaders || [],
        changelog: v.changelog,
        versionType: v.version_type,
        publishDate: v.date_published,
        downloadUrls: v.files?.map((f: any) => f.url) || [],
        primaryFilename: primaryFile?.filename,
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  },
};
