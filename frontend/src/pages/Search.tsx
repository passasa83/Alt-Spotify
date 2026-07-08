import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import SearchBar from '@/components/SearchBar';
import TrackCard from '@/components/TrackCard';
import ArtistCard from '@/components/ArtistCard';
import AlbumCard from '@/components/AlbumCard';
import PlaylistCard from '@/components/PlaylistCard';

const GENRES = [
  'Pop', 'Hip-Hop', 'Rock', 'R&B', 'Jazz', 'Classical', 'Electronic',
  'Country', 'Metal', 'Folk', 'Latin', 'Indie', 'Punk', 'Reggae',
];

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, setQuery, results, isLoading } = useSearch();
  const hasResults =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0;

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams, setQuery]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="pb-24">
      <div className="mb-8 max-w-xl">
        <SearchBar value={query} onChange={handleSearch} placeholder="What do you want to listen to?" />
      </div>

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
                {results.tracks.slice(0, 6).map((track) => (
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
