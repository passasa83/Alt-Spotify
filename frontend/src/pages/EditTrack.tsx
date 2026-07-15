import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrack, updateTrack } from '@/api/tracks';
import type { Track } from '@/types';

const EditTrack = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [isExplicit, setIsExplicit] = useState(false);
  const [allowedTerritories, setAllowedTerritories] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getTrack(id)
      .then((track: Track) => {
        setTitle(track.title);
        setArtist(track.artist?.name || '');
        setAlbum(track.album?.title || '');
        setGenre(track.genre || '');
        setIsExplicit(track.is_explicit);
        setAllowedTerritories(track.allowed_territories?.join(', ') || '');
      })
      .catch(() => setError('Failed to load track'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    
    setSaving(true);
    setError('');
    
    try {
      await updateTrack(id, {
        title,
        genre,
        is_explicit: isExplicit,
        allowed_territories: allowedTerritories ? allowedTerritories.split(',').map(t => t.trim()) : null,
      });
      navigate('/admin/catalogue');
    } catch (err) {
      setError('Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-24">
      <h1 className="text-3xl font-bold text-white">Edit Track</h1>
      
      {error && <div className="rounded-lg bg-red-500/10 p-4 text-red-400">{error}</div>}
      
      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-gray-900 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Genre</label>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div className="flex items-center pt-8">
            <input
              type="checkbox"
              id="edit-explicit"
              checked={isExplicit}
              onChange={(e) => setIsExplicit(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
            />
            <label htmlFor="edit-explicit" className="ml-2 text-sm font-medium text-gray-300">Explicit Content</label>
          </div>
        </div>
        
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Allowed Territories</label>
          <input
            value={allowedTerritories}
            onChange={(e) => setAllowedTerritories(e.target.value)}
            placeholder="e.g. FR,US (blank for all)"
            className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-green-500 py-3 font-bold text-black hover:bg-green-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Update Track'}
        </button>
      </form>
    </div>
  );
};

export default EditTrack;
