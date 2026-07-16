import { useState, useRef } from 'react';
import { uploadTrack } from '@/api/tracks';
import { useTranslation } from '@/hooks/useTranslation';
import { Upload, CheckCircle, AlertCircle, Music } from 'lucide-react';

const AdminUpload = () => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [isExplicit, setIsExplicit] = useState(false);
  const [allowedTerritories, setAllowedTerritories] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
    setSuccess(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !artist) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await uploadTrack(file, { 
        title, 
        artist, 
        album, 
        genre, 
        is_explicit: isExplicit,
        allowed_territories: allowedTerritories || undefined
      });

      clearInterval(interval);
      setProgress(100);
      setSuccess(true);
      setFile(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      setGenre('');
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold text-white">{t('upload.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
            dragActive
              ? 'border-green-500 bg-green-500/10'
              : file
              ? 'border-green-500 bg-gray-800'
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center gap-3">
              <Music size={32} className="text-green-500" />
              <div>
                <p className="font-medium text-white">{file.name}</p>
                <p className="text-sm text-gray-400">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload size={48} className="mb-4 text-gray-500" />
              <p className="text-lg font-medium text-white">{t('upload.drop_file')}</p>
              <p className="text-sm text-gray-400">{t('upload.or_browse')}</p>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-400">{t('upload.track_title')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
              placeholder={t('upload.track_title_placeholder')}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-400">{t('upload.artist_name')}</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
              className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
              placeholder={t('upload.artist_placeholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-400">{t('upload.album_name')}</label>
              <input
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
                placeholder={t('upload.album_placeholder')}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-400">{t('upload.genre')}</label>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
                placeholder={t('upload.genre_placeholder')}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="explicit"
                checked={isExplicit}
                onChange={(e) => setIsExplicit(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
              />
              <label htmlFor="explicit" className="text-sm font-medium text-gray-300">{t('upload.explicit_content')}</label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-400">{t('upload.allowed_territories')}</label>
              <input
                value={allowedTerritories}
                onChange={(e) => setAllowedTerritories(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
                placeholder={t('upload.allowed_territories_placeholder')}
              />
            </div>
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-right text-sm text-gray-400">{progress}%</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-400">
            <CheckCircle size={20} />
            {t('upload.success')}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-400">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !title || !artist || uploading}
          className="w-full rounded-full bg-green-500 py-3 font-bold text-black hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? t('upload.uploading') : t('upload.upload_track')}
        </button>
      </form>
    </div>
  );
};

export default AdminUpload;
