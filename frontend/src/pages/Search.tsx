import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import SearchBar from '@/components/SearchBar';
import SearchFiltersPanel from '@/components/SearchFiltersPanel';
import TrackCard from '@/components/TrackCard';
import ArtistCard from '@/components/ArtistCard';
import AlbumCard from '@/components/AlbumCard';
import PlaylistCard from '@/components/PlaylistCard';
import { Globe, HardDrive } from 'lucide-react';
import type { SearchFilters } from '@/types';
import { GENRES } from '@/constants/genres';

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, setQuery, filters, setFilters, source, setSource, results, isLoading } = useSearch();
  const hasResults =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0;

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    const urlFilters: SearchFilters = {};
    if (searchParams.get('genre')) urlFilters.genre = searchParams.get('genre')!;
    if (searchParams.get('year')) urlFilters.year = Number(searchParams.get('year'));
    if (searchParams.get('min_bpm')) urlFilters.min_bpm = Number(searchParams.get('min_bpm'));
    if (searchParams.get('max_bpm')) urlFilters.max_bpm = Number(searchParams.get('max_bpm'));
    if (searchParams.get('key')) urlFilters.key = searchParams.get('key')!;
    if (searchParams.get('mood')) urlFilters.mood = searchParams.get('mood')!;
    if (searchParams.get('lyrics')) urlFilters.lyrics = searchParams.get('lyrics')!;
    if (Object.keys(urlFilters).length > 0) setFilters(urlFilters);
  }, [searchParams, setQuery, setFilters]);

  const handleSearch = (value: string) => {
    setQuery(value);
    const params: Record<string, string> = {};
    if (value) params.q = value;
    if (filters.genre) params.genre = filters.genre;
    if (filters.year) params.year = String(filters.year);
    if (filters.min_bpm) params.min_bpm = String(filters.min_bpm);
    if (filters.max_bpm) params.max_bpm = String(filters.max_bpm);
    if (filters.key) params.key = filters.key;
    if (filters.mood) params.mood = filters.mood;
    if (filters.lyrics) params.lyrics = filters.lyrics;
    setSearchParams(params);
  };

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (newFilters.genre) params.genre = newFilters.genre;
    if (newFilters.year) params.year = String(newFilters.year);
    if (newFilters.min_bpm) params.min_bpm = String(newFilters.min_bpm);
    if (newFilters.max_bpm) params.max_bpm = String(newFilters.max_bpm);
    if (newFilters.key) params.key = newFilters.key;
    if (newFilters.mood) params.mood = newFilters.mood;
    if (newFilters.lyrics) params.lyrics = newFilters.lyrics;
    setSearchParams(params);
  };

  return (
    <div className="pb-24">
      <div className="mb-8 max-w-xl">
        <SearchBar value={query} onChange={handleSearch} placeholder="What do you want to listen to?" />
      </div>

      {query && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setSource('local')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
              source === 'local' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            Local
          </button>
          <button
            onClick={() => setSource('all')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
              source === 'all' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            All
          </button>
          <button
            onClick={() => setSource('tidal')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
              source === 'tidal' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Tidal
          </button>
        </div>
      )}

      {query && (
        <SearchFiltersPanel filters={filters} onChange={handleFiltersChange} />
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
        </div>
      )}

      {!query && !isLoading && (
        <div>
          <h2 className="mb-6 text-2xl font-bold text-white">Browse all</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {GENRES.map((genre) => (
              <div
                key={genre}
                onClick={() => handleFiltersChange({ genre })}
                className="relative cursor-pointer overflow-hidden rounded-lg bg-gradient-to-br from-purple-600 to-blue-400 p-4 transition-transform hover:scale-105"
              >
                <span className="text-lg font-bold text-white">{genre}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {query && !isLoading && hasResults && (
        <div className="space-y-8">
          {results.tracks.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">Songs</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.tracks.slice(0, 12).map((track) => (
                  <TrackCard key={track.id} track={track} />
                ))}
              </div>
            </section>
          )}

          {results.artists.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">Artists</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.artists.slice(0, 6).map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {results.albums.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">Albums</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.albums.slice(0, 6).map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {results.playlists.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">Playlists</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.playlists.slice(0, 6).map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {query && !isLoading && !hasResults && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-xl font-bold text-white">No results found for "{query}"</p>
          <p className="mt-2 text-gray-400">Check your spelling or try different keywords.</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
