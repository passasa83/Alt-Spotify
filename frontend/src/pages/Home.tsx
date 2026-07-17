import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTracks } from '@/api/tracks';
import { getArtists } from '@/api/artists';
import { getPlaylists } from '@/api/playlists';
import { usePlayerStore } from '@/stores/playerStore';
import TrackCard from '@/components/TrackCard';
import ArtistCard from '@/components/ArtistCard';
import PlaylistCard from '@/components/PlaylistCard';
import type { Track, Artist, Playlist } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const Home = () => {
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tracksRes, artistsRes, playlistsRes] = await Promise.all([
          getTracks(1, 10),
          getArtists(1, 8),
          getPlaylists(1, 8),
        ]);
        setRecentTracks(tracksRes.items);
        setTopArtists(artistsRes.items);
        setFeaturedPlaylists(playlistsRes.items);
      } catch {
        console.error('Failed to load home data');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center" aria-label={t('common.loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <section>
        <h2 className="mb-4 text-2xl font-bold text-white">{t('nav.home')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recentTracks.slice(0, 6).map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-4 rounded-md bg-white/10 p-2 transition-colors hover:bg-white/20"
              onClick={() => {
                const { setTrack } = usePlayerStore.getState();
                setTrack(track);
              }}
            >
              <img
                src={track.cover_url || track.album?.cover_url || '/placeholder-album.svg'}
                alt={track.title}
                className="h-12 w-12 rounded object-cover"
              />
              <span className="truncate text-sm font-semibold text-white">{track.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">{t('stats.top_tracks')}</h2>
          <button onClick={() => navigate('/search')} className="text-sm font-semibold text-gray-400 hover:underline focus-visible:outline-2 focus-visible:outline-green-500">{t('action.show_all')}</button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {recentTracks.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">{t('stats.top_artists')}</h2>
          <button onClick={() => navigate('/search')} className="text-sm font-semibold text-gray-400 hover:underline focus-visible:outline-2 focus-visible:outline-green-500">{t('action.show_all')}</button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {topArtists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">{t('nav.playlists')}</h2>
          <button onClick={() => navigate('/library')} className="text-sm font-semibold text-gray-400 hover:underline focus-visible:outline-2 focus-visible:outline-green-500">{t('action.show_all')}</button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {featuredPlaylists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
