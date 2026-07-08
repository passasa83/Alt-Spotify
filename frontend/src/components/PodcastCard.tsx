import { Link } from 'react-router-dom';
import type { Podcast } from '@/types';
import { Headphones } from 'lucide-react';

interface PodcastCardProps {
  podcast: Podcast;
}

const PodcastCard = ({ podcast }: PodcastCardProps) => {
  return (
    <Link
      to={`/podcasts/${podcast.id}`}
      className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800"
    >
      <div className="relative mb-3">
        <img
          src={podcast.image_url || '/placeholder-podcast.png'}
          alt={podcast.title}
          className="h-40 w-full rounded-md object-cover shadow-lg"
        />
        <div className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-black shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
          <Headphones size={18} />
        </div>
      </div>
      <h3 className="block truncate text-sm font-semibold text-white hover:underline">
        {podcast.title}
      </h3>
      <p className="block truncate text-xs text-gray-400">
        {podcast.author || 'Unknown Author'}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {podcast.episode_count} {podcast.episode_count === 1 ? 'episode' : 'episodes'}
      </p>
      {podcast.categories && podcast.categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {podcast.categories.slice(0, 2).map((cat) => (
            <span key={cat} className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
              {cat}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
};

export default PodcastCard;
