import { useState, useEffect } from 'react';
import { getDiscoverWeekly, getDailyMixes } from '@/api/recommendations';
import TrackList from '@/components/TrackList';
import { Sparkles, Music } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Track } from '@/types';

interface DailyMix {
  mix_id: string;
  title: string;
  description: string;
  genre: string | null;
  track_count: number;
  tracks: Track[];
}

const Recommendations = () => {
  const { t } = useTranslation();
  const [discoverTracks, setDiscoverTracks] = useState<Track[]>([]);
  const [dailyMixes, setDailyMixes] = useState<DailyMix[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDiscoverWeekly(),
      getDailyMixes(),
    ])
      .then(([discover, mixes]) => {
        setDiscoverTracks(discover.tracks || []);
        setDailyMixes(mixes.mixes || []);
      })
      .catch(() => console.error('Failed to load recommendations'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-center gap-3">
        <Sparkles size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">
          {t('nav.liked_songs').includes('favoris') ? 'Découvertes' : 'Discover'}
        </h1>
      </div>

      {discoverTracks.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white">Discover Weekly</h2>
          <div className="rounded-lg bg-gray-900 p-4">
            <TrackList tracks={discoverTracks} showIndex={true} />
          </div>
        </section>
      )}

      {dailyMixes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white">Daily Mixes</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dailyMixes.map((mix) => (
              <div
                key={mix.mix_id}
                className="rounded-lg bg-gray-900 p-5 transition-colors hover:bg-gray-800"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-green-500/20">
                    <Music size={24} className="text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{mix.title}</h3>
                    <p className="text-sm text-gray-400">{mix.description}</p>
                  </div>
                </div>
                <TrackList tracks={mix.tracks.slice(0, 5)} showAlbum={false} showIndex={false} />
                {mix.track_count > 5 && (
                  <p className="mt-2 text-center text-xs text-gray-500">
                    + {mix.track_count - 5} more tracks
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Recommendations;
