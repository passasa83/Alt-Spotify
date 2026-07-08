import { useState, useEffect, useCallback } from 'react';
import { search as searchApi } from '@/api/search';
import type { SearchResults } from '@/types';

export const useSearch = (debounceMs = 300) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ tracks: [], artists: [], albums: [], playlists: [] });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await searchApi(searchQuery);
      setResults(data);
    } catch {
      setError('Failed to search');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, search]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
  };
};
