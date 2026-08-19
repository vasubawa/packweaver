export interface SearchResult {
  id: string;
  name: string;
  author: string;
  iconUrl: string;
}

export interface SourcePlugin {
  id: 'modrinth' | 'curseforge' | 'local';
  name: string;
  
  // Brand Assets
  colors: {
    primary: string; // Hex color for backgrounds
    primaryHover: string; // Hex color for hovers
    textClass: string; // Tailwind class like 'text-black' or 'text-white'
    borderClass: string; // Tailwind class
  };
  iconUrl: string;
  fallbackEmoji: string;
  
  // Capabilities
  canSearch: boolean;
  search?: (query: string, limit?: number, offset?: number) => Promise<SearchResult[]>;
}
