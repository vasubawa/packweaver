import { SourcePlugin } from './types';

export const LocalPlugin: SourcePlugin = {
  id: 'local',
  name: 'Local',
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
