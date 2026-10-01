import { useState } from 'react';
import { Download, Check } from 'lucide-react';
import client from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';

/** Offline download state and toggle for a track (also used by the player's toolbar). */
export function useTrackDownload(trackId: string) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { isDownloaded, downloadTrack, removeDownload } = usePlayerStore();
  const downloaded = isDownloaded(trackId);

  const toggle = async () => {
    if (downloaded) {
      removeDownload(trackId);
      return;
    }
    setIsDownloading(true);
    try {
      const response = await client.get(`/stream/${trackId}/download`, {
        responseType: 'blob',
      });
      downloadTrack(trackId, response.data);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return { downloaded, isDownloading, toggle };
}

interface Props {
  trackId: string;
  className?: string;
}

const DownloadButton = ({ trackId, className = '' }: Props) => {
  const { downloaded, isDownloading, toggle } = useTrackDownload(trackId);

  return (
    <button
      onClick={toggle}
      disabled={isDownloading}
      className={`p-1 transition-colors ${
        downloaded
          ? 'text-green-500 hover:text-red-400'
          : 'text-gray-400 hover:text-white'
      } ${className}`}
      title={downloaded ? 'Remove download' : 'Download for offline'}
    >
      {isDownloading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-white" />
      ) : downloaded ? (
        <Check size={16} />
      ) : (
        <Download size={16} />
      )}
    </button>
  );
};

export default DownloadButton;
