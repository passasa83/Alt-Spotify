import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPodcast } from '@/api/podcasts';
import { useTranslation } from '@/hooks/useTranslation';
import type { Podcast, Episode } from '@/types';
import EpisodeItem from '@/components/EpisodeItem';
import { ArrowLeft, Headphones, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

const PodcastDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [podcast, setPodcast] = useState<(Podcast & { episodes: Episode[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPodcast(id)
      .then(setPodcast)
      .catch(() => setError('Failed to load podcast'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !podcast) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{error || t('podcast.not_found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/podcasts" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={20} />
        {t('podcast.back_to_podcasts')}
      </Link>

      <div className="flex flex-col gap-6 md:flex-row">
        <img
          src={podcast.image_url || '/placeholder-podcast.svg'}
          alt={podcast.title}
          className="h-48 w-48 flex-shrink-0 rounded-lg object-cover shadow-lg md:h-64 md:w-64"
        />
        <div className="flex flex-col justify-end">
          <p className="text-sm font-medium text-gray-400">{t('podcast.podcast')}</p>
          <h1 className="mt-1 text-4xl font-bold text-white">{podcast.title}</h1>
          <p className="mt-2 text-gray-400">{podcast.author || t('podcast.unknown_author')}</p>
          {podcast.description && (
            <p className="mt-4 line-clamp-3 text-sm text-gray-500">{podcast.description}</p>
          )}
          <div className="mt-4 flex items-center gap-4">
            <button className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-sm font-bold text-black hover:bg-green-400 transition-colors">
              <Play size={18} fill="currentColor" />
              {t('podcast.play_all')}
            </button>
            <span className="text-sm text-gray-500">
              {podcast.episode_count} {t('podcast.episodes_count', { count: podcast.episode_count })}
            </span>
          </div>
          {podcast.categories && podcast.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {podcast.categories.map((cat) => (
                <span key={cat} className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-400">
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">{t('podcast.episodes')}</h2>
        {podcast.episodes && podcast.episodes.length > 0 ? (
          podcast.episodes.map((episode) => (
            <EpisodeItem key={episode.id} episode={episode} />
          ))
        ) : (
          <p className="text-gray-500">{t('podcast.no_episodes')}</p>
        )}
      </div>
    </div>
  );
};

export default PodcastDetail;
