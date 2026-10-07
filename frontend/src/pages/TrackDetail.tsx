import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTrack, resolveCoverUrl } from '@/api/tracks';
import { getAlbum, getAlbumTracks } from '@/api/albums';
import { getParsedLyrics } from '@/api/lyrics';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { Play, Pause, Heart } from 'lucide-react';
import type { Album, Track, LyricsLine } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import TrackList from '@/components/TrackList';

const TrackDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [track, setTrackData] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lyrics, setLyrics] = useState<LyricsLine[]>([]);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [albumLoading, setAlbumLoading] = useState(false);
  const { setTrack, currentTrack, isPlaying, togglePlay, progress } = usePlayerStore();
  const { addToFavorites, removeFromFavorites, isFavorite } = useLibraryStore();
  const liked = isFavorite(String(id));

  useEffect(() => {
    const loadTrack = async () => {
      if (!id) return;
      setAlbum(null);
      setAlbumTracks([]);
      try {
        const data = await getTrack(id);
        setTrackData(data);
        if (data.lyrics_lrc) {
          const parsed = await getParsedLyrics(id);
          setLyrics(parsed);
        }
        if (data.album_id) {
          // The page is usable without this: load the album beside it.
          setAlbumLoading(true);
          const [albumData, tracksData] = await Promise.all([
            data.album ? Promise.resolve(data.album) : getAlbum(data.album_id).catch(() => null),
            getAlbumTracks(data.album_id).catch(() => []),
          ]);
          setAlbum(albumData);
          setAlbumTracks(tracksData);
        }
      } catch {
        console.error('Failed to load track');
      } finally {
        setIsLoading(false);
        setAlbumLoading(false);
      }
    };
    loadTrack();
  }, [id]);

  const activeLyricIndex = lyrics.length > 0
    ? lyrics.findIndex((l, i) => {
        const next = lyrics[i + 1];
        return progress >= l.time_seconds && (!next || progress < next.time_seconds);
      })
    : -1;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">{t('track.not_found')}</p>
      </div>
    );
  }

  const isCurrentTrack = currentTrack?.id === track.id;

  const handlePlay = () => {
    if (isCurrentTrack) {
      togglePlay();
    } else {
      setTrack(track);
    }
  };

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
        <img
          src={resolveCoverUrl(track.cover_url || track.album?.cover_url)}
          alt={track.title}
          className="h-48 w-48 rounded-md object-cover shadow-2xl md:h-56 md:w-56"
        />
        <div>
          <p className="text-sm font-medium uppercase text-white">{t('track.song')}</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">{track.title}</h1>
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
            <Link to={`/artist/${track.artist?.id || track.artist_id}`} className="font-medium text-white hover:underline">
              {track.artist?.name || t('player.unknown_artist')}
            </Link>
            {track.album_id && (
              <>
                <span>•</span>
                <Link to={`/album/${track.album_id}`} className="hover:underline">
                  {track.album?.title || t('player.unknown_album')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handlePlay}
          aria-label={isCurrentTrack && isPlaying ? t('player.pause') : t('player.play')}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          {isCurrentTrack && isPlaying ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" />
          )}
        </button>
        <button
          onClick={() => {
            if (liked) removeFromFavorites(String(track.id));
            else addToFavorites(track);
          }}
          aria-label={t('nav.liked_songs')}
          aria-pressed={liked}
          className="text-gray-400 transition-colors hover:text-white"
        >
          <Heart size={24} fill={liked ? 'currentColor' : 'none'} className={liked ? 'text-green-500' : ''} />
        </button>
      </div>

      {track.album_id && (
        <section className="mt-8 rounded-lg bg-gray-900 p-6">
          <div className="mb-4 flex items-center gap-4">
            <img
              src={resolveCoverUrl(album?.cover_url || track.cover_url || track.album?.cover_url)}
              alt={album?.title || track.album?.title || ''}
              className="h-16 w-16 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-gray-400">{t('album.album')}</p>
              <Link
                to={`/album/${track.album_id}`}
                className="block truncate text-lg font-bold text-white hover:underline"
              >
                {album?.title || track.album?.title || t('player.unknown_album')}
              </Link>
              {!albumLoading && (
                <p className="text-sm text-gray-400">{t('artist.track_count', { count: albumTracks.length })}</p>
              )}
            </div>
          </div>
          {albumLoading ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
            </div>
          ) : (
            <TrackList tracks={albumTracks} showIndex={false} showAlbum={false} playlistTracks={albumTracks} />
          )}
        </section>
      )}

      {(track.bpm || track.key || track.mood || track.genre) && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-400">
          {track.bpm && <span>BPM: <span className="text-white">{track.bpm}</span></span>}
          {track.key && <span>Key: <span className="text-white">{track.key}</span></span>}
          {track.mood && <span>Mood: <span className="text-white">{track.mood}</span></span>}
          {track.genre && <span>Genre: <span className="text-white">{track.genre}</span></span>}
        </div>
      )}

      <div className="mt-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('track.lyrics')}</h2>
        {lyrics.length > 0 ? (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {lyrics.map((line, i) => (
              <p
                key={i}
                className={`transition-all duration-300 ${
                  i === activeLyricIndex
                    ? 'text-lg font-bold text-white'
                    : 'text-sm text-gray-500'
                }`}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">{t('track.lyrics_not_available')}</p>
        )}
      </div>

      <div className="mt-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">{t('track.about_artist')}</h2>
        <Link to={`/artist/${track.artist?.id || track.artist_id}`} className="text-green-500 hover:underline">
          {track.artist?.name || t('player.unknown_artist')}
        </Link>
      </div>
    </div>
  );
};

export default TrackDetail;
