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
    let active = true;

    if (searchFn && query.trim().length > 2) {
      const timeout = setTimeout(async () => {
        try {
          const r = await searchFn(query, {
            limit: 20,
            loaders: filters?.loaders,
            gameVersions: filters?.gameVersions,
          });
          if (!active) return;
          setResults(r);
          setLastCompletedQuery(query);
        } catch (e) {
          console.error(e);
          if (!active) return;
          setResults([]);
          setLastCompletedQuery(query);
        }
      }, 400);
      return () => {
        active = false;
        clearTimeout(timeout);
      };
    }

    const timeout = setTimeout(() => {
      if (!active) return;
      setResults([]);
      setLastCompletedQuery(null);
    }, 0);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFn, query, loadersKey, versionsKey]);

  const isSearching = !!(searchFn && query.trim().length > 2 && query !== lastCompletedQuery);

  return { results, isSearching };
}
