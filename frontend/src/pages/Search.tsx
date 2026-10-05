import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import SearchBar from '@/components/SearchBar';
import SearchFiltersPanel from '@/components/SearchFiltersPanel';
import TrackCard from '@/components/TrackCard';
import ArtistCard from '@/components/ArtistCard';
import AlbumCard from '@/components/AlbumCard';
import PlaylistCard from '@/components/PlaylistCard';
import { getTracks } from '@/api/tracks';
import { Globe, HardDrive } from 'lucide-react';
import type { SearchFilters, Track } from '@/types';
import { GENRES } from '@/constants/genres';
import { useTranslation } from '@/hooks/useTranslation';

const GENRE_PAGE_SIZE = 50;

const SearchPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, setQuery, filters, setFilters, source, setSource, results, isLoading, error } = useSearch();
  const hasResults =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0;

  // Clicking a genre tile with no query browses that genre instead of searching.
  const browseGenre = !query ? filters.genre : undefined;
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState(false);

  useEffect(() => {
    if (!browseGenre) {
      setGenreTracks([]);
      setGenreError(false);
      return;
    }
    let cancelled = false;
    setGenreLoading(true);
    setGenreError(false);
    getTracks(1, GENRE_PAGE_SIZE, { genre: browseGenre, playable: true })
      .then((page) => {
        if (!cancelled) setGenreTracks(page.items);
      })
      .catch(() => {
        if (!cancelled) setGenreError(true);
      })
      .finally(() => {
        if (!cancelled) setGenreLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browseGenre]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    const urlFilters: SearchFilters = {};
    if (searchParams.get('genre')) urlFilters.genre = searchParams.get('genre')!;
    if (searchParams.get('year')) urlFilters.year = Number(searchParams.get('year'));
    if (searchParams.get('min_bpm')) urlFilters.min_bpm = Number(searchParams.get('min_bpm'));
    if (searchParams.get('max_bpm')) urlFilters.max_bpm = Number(searchParams.get('max_bpm'));
    if (searchParams.get('min_duration')) urlFilters.min_duration = Number(searchParams.get('min_duration'));
    if (searchParams.get('max_duration')) urlFilters.max_duration = Number(searchParams.get('max_duration'));
    if (searchParams.get('key')) urlFilters.key = searchParams.get('key')!;
    if (searchParams.get('mood')) urlFilters.mood = searchParams.get('mood')!;
    if (searchParams.get('lyrics')) urlFilters.lyrics = searchParams.get('lyrics')!;
    if (Object.keys(urlFilters).length > 0) setFilters(urlFilters);
  }, [searchParams, setQuery, setFilters]);

  const paramsFromFilters = (current: SearchFilters, q = query) => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (current.genre) params.genre = current.genre;
    if (current.year) params.year = String(current.year);
    if (current.min_bpm) params.min_bpm = String(current.min_bpm);
    if (current.max_bpm) params.max_bpm = String(current.max_bpm);
    if (current.min_duration) params.min_duration = String(current.min_duration);
    if (current.max_duration) params.max_duration = String(current.max_duration);
    if (current.key) params.key = current.key;
    if (current.mood) params.mood = current.mood;
    if (current.lyrics) params.lyrics = current.lyrics;
    return params;
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setSearchParams(paramsFromFilters(filters, value));
  };

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setSearchParams(paramsFromFilters(newFilters));
  };

  const clearGenre = () => {
    setFilters({});
    setSearchParams({});
  };

  return (
    <div className="pb-24">
      <div className="mb-8 max-w-xl">
        <SearchBar value={query} onChange={handleSearch} />
      </div>

      {query && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setSource('local')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-4 ${
              source === 'local' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            {t('search.source_local')}
          </button>
          <button
            onClick={() => setSource('all')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-4 ${
              source === 'all' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            {t('common.all')}
          </button>
          <button
            onClick={() => setSource('tidal')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-4 ${
              source === 'tidal' ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Tidal
          </button>
        </div>
      )}

      {(query || browseGenre) && (
        <SearchFiltersPanel filters={filters} onChange={handleFiltersChange} />
      )}

      {error && !isLoading && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {t('search.error')}
        </p>
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
        </div>
      )}

      {!query && !isLoading && (
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <h2 className="text-2xl font-bold text-white">{browseGenre ?? t('search.browse_all')}</h2>
            {browseGenre && (
              <button
                onClick={clearGenre}
                className="rounded-full bg-gray-800 px-4 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                {t('search.back_to_browse')}
              </button>
            )}
          </div>

          {browseGenre ? (
            genreLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
              </div>
            ) : genreError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
                {t('search.error')}
              </p>
            ) : genreTracks.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {genreTracks.map((track) => (
                  <TrackCard key={track.id} track={track} />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-gray-400">{t('search.no_results', { query: browseGenre })}</p>
            )
          ) : (
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
          )}
        </div>
      )}

      {query && !isLoading && hasResults && (
        <div className="space-y-8">
          {results.tracks.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">{t('search.songs')}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.tracks.slice(0, 12).map((track) => (
                  <TrackCard key={track.id} track={track} />
                ))}
              </div>
            </section>
          )}

          {results.artists.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">{t('search.artists')}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.artists.slice(0, 6).map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {results.albums.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">{t('search.albums')}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.albums.slice(0, 6).map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {results.playlists.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">{t('search.playlists')}</h2>
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
          <p className="text-xl font-bold text-white">{t('search.no_results', { query })}</p>
          <p className="mt-2 text-gray-400">{t('search.try_different')}</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
