import { useState, useEffect } from 'react';
import { SourcePlugin, SearchResult } from '../plugins/types';

export function usePluginSearch(
  plugin: SourcePlugin | undefined,
  query: string,
  mode: 'pack' | 'mod' = 'pack'
) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastCompletedQuery, setLastCompletedQuery] = useState<string | null>(null);
  const searchFn = mode === 'mod' ? plugin?.searchMods : plugin?.search;

  useEffect(() => {
    if (searchFn && query.trim().length > 2) {
      const timeout = setTimeout(async () => {
        try {
          const r = await searchFn(query, 20);
          setResults(r);
        } catch (e) {
          console.error(e);
          setResults([]);
        } finally {
          setLastCompletedQuery(query);
        }
      }, 400);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(timeout);
    }
  }, [searchFn, query]);

  const isSearching = !!(searchFn && query.trim().length > 2 && query !== lastCompletedQuery);

  return { results, isSearching };
}
