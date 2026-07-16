import { useEffect, useState } from 'react';
import { getPodcasts } from '@/api/podcasts';
import { useTranslation } from '@/hooks/useTranslation';
import type { Podcast, PaginatedResponse } from '@/types';
import PodcastCard from '@/components/PodcastCard';
import { Headphones } from 'lucide-react';

const CATEGORIES = [
  'Technology', 'Science', 'Business', 'Health', 'Education',
  'Entertainment', 'News', 'Sports', 'Arts', 'Comedy',
];

const Podcasts = () => {
  const { t } = useTranslation();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadPodcasts();
  }, [page, selectedCategory]);

  const loadPodcasts = async () => {
    setLoading(true);
    try {
      const response = await getPodcasts(page, 20, selectedCategory || undefined);
      setPodcasts(response.items);
      setTotalPages(response.pages);
    } catch (error) {
      console.error('Failed to load podcasts:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Headphones size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">{t('podcast.podcast')}</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-white text-black'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {t('common.all')}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : podcasts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-gray-500">
          <Headphones size={48} className="mb-4" />
          <p>{t('podcast.no_podcasts')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {podcasts.map((podcast) => (
            <PodcastCard key={podcast.id} podcast={podcast} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-gray-400">
            {t('common.page_of', { current: page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
};

export default Podcasts;
