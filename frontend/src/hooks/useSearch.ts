import { useState, useEffect, useCallback } from 'react';
import { search as searchApi } from '@/api/search';
import type { SearchResults, SearchFilters } from '@/types';

export const useSearch = (debounceMs = 300) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [source, setSource] = useState<'local' | 'tidal' | 'all'>('local');
  const [results, setResults] = useState<SearchResults>({
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (searchQuery: string, searchFilters: SearchFilters, searchSource: 'local' | 'tidal' | 'all') => {
    if (!searchQuery.trim()) {
      setResults({ tracks: [], artists: [], albums: [], playlists: [] });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await searchApi(searchQuery, searchFilters, searchSource);
      setResults(data);
    } catch {
      setError('Failed to search');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query, filters, source);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, filters, source, debounceMs, search]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    source,
    setSource,
    results,
    isLoading,
    error,
  };
};
