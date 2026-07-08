import { useState, useEffect } from 'react';
import { Download, Check, Trash2 } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';

interface Props {
  trackId: string;
  className?: string;
}

const DownloadButton = ({ trackId, className = '' }: Props) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { isDownloaded, downloadTrack, removeDownload } = usePlayerStore();
  const downloaded = isDownloaded(trackId);

  const handleDownload = async () => {
    if (downloaded) {
      removeDownload(trackId);
      return;
    }

    setIsDownloading(true);
    try {
      const deviceId = localStorage.getItem('device_id') || (() => {
        const id = crypto.randomUUID();
        localStorage.setItem('device_id', id);
        return id;
      })();

      const response = await fetch(`/api/v1/tracks/${trackId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });

      if (!response.ok) throw new Error('Download failed');

      const { download_url } = await response.json();

      const audioResponse = await fetch(download_url);
      const blob = await audioResponse.blob();
      downloadTrack(trackId, blob);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
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
