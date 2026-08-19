import { SourcePlugin } from './types';

export const LocalPlugin: SourcePlugin = {
  id: 'local',
  name: 'Local Upload',
  description: 'Import existing .zip or .mrpack modpack archives from your machine.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'source',
  enabled: true,
  builtIn: true,
  isCore: true,
  colors: {
    primary: '#c49474',
    primaryHover: '#a37659',
    textClass: 'text-white',
    borderClass: 'border-[#c49474]/50 hover:border-[#c49474]',
  },
  iconUrl: '/default.png',
  fallbackEmoji: '📦',

  canSearch: false,
};
