import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPodcast, playEpisode, getEpisodeStreamUrl } from '@/api/podcasts';
import type { Podcast, Episode } from '@/types';
import { ArrowLeft, Play, Pause, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDurationHm, formatDate } from '@/utils/formatTime';
import client from '@/api/client';

const EpisodeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [podcast, setPodcast] = useState<(Podcast & { episodes: Episode[] }) | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadEpisode = async () => {
      setLoading(true);
      try {
        const podcastsRes = await client.get('/podcasts', { params: { page_size: 100 } });
        const podcastsData = podcastsRes.data;

        for (const p of podcastsData.items) {
          const podcastData = await getPodcast(p.id);
          const found = podcastData.episodes?.find((ep) => ep.id === id);
          if (found) {
            setPodcast(podcastData);
            setEpisode(found);
            break;
          }
        }

        if (!episode) {
          setError('Episode not found');
        }
      } catch {
        setError('Failed to load episode');
      } finally {
        setLoading(false);
      }
    };

    loadEpisode();
  }, [id]);

  const handlePlay = async () => {
    if (!episode) return;
    try {
      await playEpisode(episode.id);
      setIsPlaying(!isPlaying);
    } catch (error) {
      console.error('Failed to record play:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !episode || !podcast) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{error || 'Episode not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/podcasts/${podcast.id}`}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={20} />
        Back to {podcast.title}
      </Link>

      <div className="flex flex-col gap-6 md:flex-row">
        <img
          src={podcast.image_url || '/placeholder-podcast.svg'}
          alt={podcast.title}
          className="h-48 w-48 flex-shrink-0 rounded-lg object-cover shadow-lg md:h-56 md:w-56"
        />
        <div className="flex flex-col justify-end">
          <p className="text-sm font-medium text-green-500">Podcast Episode</p>
          <h1 className="mt-1 text-3xl font-bold text-white">{episode.title}</h1>
          <p className="mt-2 text-gray-400">{podcast.title}</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            {episode.season_number && <span>Season {episode.season_number}</span>}
            {episode.episode_number && <span>Episode {episode.episode_number}</span>}
            <span>{formatDurationHm(episode.duration_seconds)}</span>
            {episode.published_at && <span>{formatDate(episode.published_at)}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handlePlay}
          className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-sm font-bold text-black hover:bg-green-400 transition-colors"
        >
          {isPlaying ? (
            <>
              <Pause size={18} fill="currentColor" />
              Pause
            </>
          ) : (
            <>
              <Play size={18} fill="currentColor" />
              Play
            </>
          )}
        </button>
        {episode.is_played && (
          <span className="flex items-center gap-1 text-sm text-green-500">
            <Check size={16} />
            Played
          </span>
        )}
      </div>

      {episode.description && (
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-3 text-lg font-semibold text-white">About this episode</h2>
          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
            {episode.description}
          </p>
        </div>
      )}
    </div>
  );
};

export default EpisodeDetail;
