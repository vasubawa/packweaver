import { SourcePlugin, SearchResult } from './types';

export const ModrinthPlugin: SourcePlugin = {
  id: 'modrinth',
  name: 'Modrinth',
  colors: {
    primary: '#42e887',
    primaryHover: '#3bc475',
    textClass: 'text-black',
    borderClass: 'border-[#42e887]/40 hover:border-[#42e887]',
  },
  iconUrl: '/modrinth.png',
  fallbackEmoji: '🧩',

  canSearch: true,
  search: async (
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchResult[]> => {
    try {
      const facets = [[`project_type:modpack`]];

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
        name: hit.title || hit.title,
        author: hit.author,
        iconUrl: hit.icon_url || '',
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },
};
