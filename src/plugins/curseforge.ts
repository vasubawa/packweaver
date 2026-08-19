import { SourcePlugin, SearchResult } from './types';

export const CurseForgePlugin: SourcePlugin = {
  id: 'curseforge',
  name: 'CurseForge',
  colors: {
    primary: '#f16436',
    primaryHover: '#d6572e',
    textClass: 'text-white',
    borderClass: 'border-[#f16436]/40 hover:border-[#f16436]',
  },
  iconUrl: '/curseforge.png',
  fallbackEmoji: '⚒️',

  canSearch: true,
  search: async (
    _query: string,
    _limit: number = 20,
    _offset: number = 0
  ): Promise<SearchResult[]> => {
    throw new Error('CurseForge API integration is not implemented yet');
  },
};
