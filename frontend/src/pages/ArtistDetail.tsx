import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getArtist, getArtistAlbums } from '@/api/artists';
import { usePlayerStore } from '@/stores/playerStore';
import AlbumCard from '@/components/AlbumCard';
import { Play, Pause, Shuffle, CheckCircle } from 'lucide-react';
import type { Artist, Album } from '@/types';
import TrackList from '@/components/TrackList';
import { getAlbumTracks } from '@/api/albums';

const ArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  useEffect(() => {
    const loadArtist = async () => {
      if (!id) return;
      try {
        const [artistData, albumsData] = await Promise.all([
          getArtist(id),
          getArtistAlbums(id),
        ]);
        setArtist(artistData);
        setAlbums(albumsData.items);

        if (albumsData.items.length > 0) {
          const tracks = await getAlbumTracks(albumsData.items[0]!.id);
          setTopTracks(tracks.slice(0, 5));
        }
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
        <p className="text-gray-400">Artist not found</p>
      </div>
    );
  }

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
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle size={20} className="text-blue-500" />
            <span className="text-sm font-medium text-white">Verified Artist</span>
          </div>
          <h1 className="text-4xl font-bold text-white md:text-6xl">{artist.name}</h1>
          <p className="mt-2 text-sm text-gray-300">2,543,210 monthly listeners</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={() => {
            if (topTracks.length > 0) {
              setTrack(topTracks[0]!);
            }
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <Shuffle size={24} />
        </button>
        <button className="rounded-full border border-gray-400 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:border-white">
          Follow
        </button>
      </div>

      {artist.bio && (
        <div className="mb-8 rounded-lg bg-gray-900 p-6">
          <h2 className="mb-2 text-xl font-bold text-white">About</h2>
          <p className="text-sm text-gray-400">{artist.bio}</p>
        </div>
      )}

      {topTracks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold text-white">Popular</h2>
          <TrackList tracks={topTracks} showAlbum={false} />
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-bold text-white">Discography</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default ArtistDetail;
