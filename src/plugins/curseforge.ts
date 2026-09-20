import { SourcePlugin, SearchResult, SearchOptions } from './types';

export const CurseForgePlugin: SourcePlugin = {
  id: 'curseforge',
  name: 'CurseForge',
  description:
    'Coming soon. CurseForge search and download are not wired yet. This source cannot be turned on.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'source',
  enabled: false,
  builtIn: true,
  comingSoon: true,
  requiresApiKey: true,
  colors: {
    primary: '#f16436',
    primaryHover: '#d6572e',
    textClass: 'text-white',
    borderClass: 'border-[#f16436]/40 hover:border-[#f16436]',
  },
  iconUrl: '/curseforge.png',
  fallbackEmoji: '⚒️',

  canSearch: false,
  search: async (_query: string, _options?: SearchOptions): Promise<SearchResult[]> => {
    throw new Error('CurseForge API integration is not implemented yet');
  },
};
