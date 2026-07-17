import { Play } from 'lucide-react';
import type { Artist } from '@/types';
import { Link } from 'react-router-dom';

interface ArtistCardProps {
  artist: Artist;
}

const ArtistCard = ({ artist }: ArtistCardProps) => {
  return (
    <Link
      to={`/artist/${artist.id}`}
      className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800"
    >
      <div className="relative mb-3">
        {artist.image_url ? (
          <img
            src={artist.image_url}
            alt={artist.name}
            className="h-40 w-full rounded-full object-cover shadow-lg"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-full bg-gradient-to-br from-purple-700 to-blue-300 shadow-lg">
            <span className="text-4xl font-bold text-white/80">{artist.name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <button
          className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-black shadow-xl transition-all ${
            'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
          }`}
        >
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <p className="block truncate text-center text-sm font-semibold text-white">{artist.name}</p>
      <p className="block truncate text-center text-xs text-gray-400">Artist</p>
    </Link>
  );
};

export default ArtistCard;
