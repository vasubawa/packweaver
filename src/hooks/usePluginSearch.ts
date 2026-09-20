import { useState, useEffect } from 'react';
import { SourcePlugin, SearchResult, SearchOptions } from '../plugins/types';

export function usePluginSearch(
  plugin: SourcePlugin | undefined,
  query: string,
  mode: 'pack' | 'mod' = 'pack',
  filters?: Pick<SearchOptions, 'loaders' | 'gameVersions'>
) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastCompletedQuery, setLastCompletedQuery] = useState<string | null>(null);
  const searchFn = mode === 'mod' ? plugin?.searchMods : plugin?.search;
  const loadersKey = (filters?.loaders || []).join(',');
  const versionsKey = (filters?.gameVersions || []).join(',');

  useEffect(() => {
    if (searchFn && query.trim().length > 2) {
      const timeout = setTimeout(async () => {
        try {
          const r = await searchFn(query, {
            limit: 20,
            loaders: filters?.loaders,
            gameVersions: filters?.gameVersions,
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFn, query, loadersKey, versionsKey]);

  const isSearching = !!(searchFn && query.trim().length > 2 && query !== lastCompletedQuery);

  return { results, isSearching };
}
