import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getArtist, getArtistAlbums } from '@/api/artists';
import { usePlayerStore } from '@/stores/playerStore';
import AlbumCard from '@/components/AlbumCard';
import { Play, Shuffle } from 'lucide-react';
import type { Artist, Album, Track } from '@/types';
import TrackList from '@/components/TrackList';
import { getTracks } from '@/api/tracks';
import { useTranslation } from '@/hooks/useTranslation';

// The API caps a page at 100: enough for a "popular" queue.
const MAX_TRACKS = 100;
const POPULAR_SHOWN = 10;

// Fisher-Yates: sorting with a random comparator is biased.
const shuffled = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

const ArtistDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const { setPlaylistAsQueue } = usePlayerStore();

  useEffect(() => {
    const loadArtist = async () => {
      if (!id) return;
      setIsLoading(true);
      setShowAll(false);
      setSelectedAlbumId('all');
      try {
        // All the artist's playable tracks, not just its first album's:
        // many tracks have no album, and albums can be empty.
        const [artistData, albumsData, tracksData] = await Promise.all([
          getArtist(id),
          getArtistAlbums(id, 1, 50, { playable: true }),
          getTracks(1, MAX_TRACKS, { artistId: id, playable: true, sort: 'play_count', order: 'desc' }),
        ]);
        setArtist(artistData);
        setAlbums(albumsData.items);
        setTracks(tracksData.items);
        setTrackCount(tracksData.total);
      } catch {
        console.error('Failed to load artist');
      } finally {
        setIsLoading(false);
      }
    };
    loadArtist();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">{t('artist.not_found')}</p>
      </div>
    );
  }

  // "Popular" can be narrowed to a single album picked from the chips below.
  const visibleTracks = selectedAlbumId === 'all' ? tracks : tracks.filter((tr) => tr.album_id === selectedAlbumId);

  return (
    <div className="pb-24">
      <div className="relative mb-6">
        <div className="h-64 w-full overflow-hidden md:h-80">
          <img
            src={artist.image_url || '/placeholder-artist.svg'}
            alt={artist.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent"></div>
        </div>
        <div className="absolute bottom-6 left-6">
          <h1 className="text-4xl font-bold text-white md:text-6xl">{artist.name}</h1>
          <p className="mt-2 text-sm text-gray-300">{t('artist.track_count', { count: trackCount })}</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={() => setPlaylistAsQueue(visibleTracks, 0)}
          disabled={visibleTracks.length === 0}
          aria-label={t('artist.play')}
          title={t('artist.play')}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          onClick={() => setPlaylistAsQueue(shuffled(visibleTracks), 0)}
          disabled={visibleTracks.length === 0}
          aria-label={t('artist.shuffle')}
          title={t('artist.shuffle')}
          className="flex h-11 w-11 items-center justify-center text-gray-400 transition-colors hover:text-white disabled:opacity-40"
        >
          <Shuffle size={24} />
        </button>
        <button className="rounded-full border border-gray-400 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:border-white">
          {t('action.follow')}
        </button>
      </div>

      {artist.bio && (
        <div className="mb-8 rounded-lg bg-gray-900 p-6">
          <h2 className="mb-2 text-xl font-bold text-white">{t('artist.about')}</h2>
          <p className="text-sm text-gray-400">{artist.bio}</p>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-bold text-white">{t('artist.popular')}</h2>
        {albums.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('artist.filter_album')}>
            <button
              onClick={() => { setSelectedAlbumId('all'); setShowAll(false); }}
              aria-pressed={selectedAlbumId === 'all'}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedAlbumId === 'all' ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {t('artist.all_albums')}
            </button>
            {albums.map((album) => (
              <button
                key={album.id}
                onClick={() => { setSelectedAlbumId(album.id); setShowAll(false); }}
                aria-pressed={selectedAlbumId === album.id}
                title={album.title}
                className={`max-w-48 truncate rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedAlbumId === album.id ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {album.title}
              </button>
            ))}
          </div>
        )}
        {visibleTracks.length > 0 ? (
          <>
            <TrackList tracks={showAll ? visibleTracks : visibleTracks.slice(0, POPULAR_SHOWN)} playlistTracks={visibleTracks} />
            {visibleTracks.length > POPULAR_SHOWN && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="mt-3 px-2 py-2 text-sm font-semibold text-gray-400 hover:text-white"
              >
                {showAll ? t('artist.show_less') : t('artist.show_more')}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">
            {selectedAlbumId === 'all' ? t('artist.no_tracks') : t('artist.no_tracks_in_album')}
          </p>
        )}
      </section>

      {albums.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold text-white">{t('artist.discography')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={{ ...album, artist: album.artist ?? artist }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ArtistDetail;
