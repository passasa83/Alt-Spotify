import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPlaylist, getPlaylistTracks, removeTrackFromPlaylist, deletePlaylist, updatePlaylist } from '@/api/playlists';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import { Play, Shuffle, Clock, Trash2, Pencil, Heart } from 'lucide-react';
import type { Playlist, PlaylistTrack, Track } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveCoverUrl } from '@/api/tracks';

const PlaylistDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { setTrack, setPlaylistAsQueue } = usePlayerStore();
  const { loadPlaylists } = useLibraryStore();
  const addToast = useToastStore((s) => s.addToast);
  const { user } = useAuthStore();
  const isOwner = playlist?.owner_id === user?.id;
  const isLikedSongs = playlist?.title === 'Liked Songs';

  useEffect(() => {
    const loadPlaylist = async () => {
      if (!id) return;
      try {
        const [playlistData, tracksData] = await Promise.all([
          getPlaylist(id),
          getPlaylistTracks(id),
        ]);
        setPlaylist(playlistData);
        setTracks(tracksData);
      } catch {
        console.error('Failed to load playlist');
      } finally {
        setIsLoading(false);
      }
    };
    loadPlaylist();
  }, [id]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      const allTracks = tracks.filter(pt => pt.track).map(pt => pt.track!);
      setPlaylistAsQueue(allTracks, 0);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const allTracks = tracks.filter(pt => pt.track).map(pt => pt.track!);
      const randomIndex = Math.floor(Math.random() * allTracks.length);
      setPlaylistAsQueue(allTracks, randomIndex);
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!id) return;
    try {
      if (isLikedSongs) {
        const { removeFavorite } = await import('@/api/favorites');
        await removeFavorite('track', trackId);
      } else {
        await removeTrackFromPlaylist(id, trackId);
      }
      setTracks((prev) => prev.filter((pt) => pt.track_id !== trackId));
      addToast('Track removed from playlist');
    } catch {
      console.error('Failed to remove track');
    }
  };

  const handleDeletePlaylist = async () => {
    if (!id) return;
    try {
      await deletePlaylist(id);
      loadPlaylists();
      addToast('Playlist deleted');
      navigate('/library');
    } catch {
      console.error('Failed to delete playlist');
    }
  };

  const handleEditPlaylist = async () => {
    if (!id || !editTitle.trim()) return;
    try {
      const updated = await updatePlaylist(id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      setPlaylist(updated);
      loadPlaylists();
      setShowEditModal(false);
      addToast('Playlist updated');
    } catch {
      console.error('Failed to update playlist');
    }
  };

  const openEditModal = () => {
    if (!playlist) return;
    setEditTitle(playlist.title);
    setEditDescription(playlist.description || '');
    setShowEditModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">{t('playlist.not_found')}</p>
      </div>
    );
  }

  const totalDuration = tracks.reduce((acc, pt) => acc + (pt.track?.duration_seconds || 0), 0);
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
        {playlist.cover_url ? (
          <img
            src={resolveCoverUrl(playlist.cover_url)}
            alt={playlist.title}
            className="h-48 w-48 rounded-md object-cover shadow-2xl md:h-56 md:w-56"
          />
        ) : isLikedSongs ? (
          <div className="flex h-48 w-48 items-center justify-center rounded-md bg-gradient-to-br from-purple-700 to-blue-300 shadow-2xl md:h-56 md:w-56">
            <Heart size={64} className="text-white" fill="white" />
          </div>
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-md bg-gradient-to-br from-purple-700 to-blue-300 shadow-2xl md:h-56 md:w-56">
            <span className="text-6xl">♫</span>
          </div>
        )}
        <div>
          <p className="text-sm font-medium uppercase text-white">{t('playlist.playlist')}</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">{playlist.title}</h1>
          {playlist.description && (
            <p className="mt-2 text-sm text-gray-400">{playlist.description}</p>
          )}
          <p className="mt-2 text-sm text-gray-400">
            {playlist.owner_name || 'Unknown'} • {tracks.length} {t('playlist.songs')}
            {hours > 0 && `, ${hours} hr`}
            {minutes > 0 && ` ${minutes} min`}
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handlePlayAll}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          onClick={handleShufflePlay}
          className="text-gray-400 transition-colors hover:text-white"
        >
          <Shuffle size={24} />
        </button>
        {isOwner && !isLikedSongs && (
          <>
            <button
              onClick={openEditModal}
              className="text-gray-400 transition-colors hover:text-white"
              title="Edit playlist"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-gray-400 transition-colors hover:text-red-500"
              title="Delete playlist"
            >
              <Trash2 size={20} />
            </button>
          </>
        )}
      </div>

      <div className="mb-2 grid grid-cols-[16px_4fr_3fr_minmax(80px,1fr)_32px] gap-4 border-b border-gray-700 px-4 py-2 text-xs uppercase tracking-wider text-gray-400 md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]">
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden md:block">Album</span>
        <span className="hidden md:block">Date Added</span>
        <span className="flex justify-end">
          <Clock size={16} />
        </span>
        <span />
      </div>

      <div className="space-y-0.5">
        {tracks.map((pt, index) => (
          pt.track && (
            <div
              key={pt.track_id}
              className="group grid cursor-pointer items-center gap-4 rounded-md px-4 py-2 transition-colors hover:bg-gray-800 md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]"
              onDoubleClick={() => {
                if (pt.track) {
                  const allTracks = tracks.filter(p => p.track).map(p => p.track!);
                  const trackIndex = allTracks.findIndex(t => t.id === pt.track!.id);
                  setPlaylistAsQueue(allTracks, trackIndex >= 0 ? trackIndex : 0);
                }
              }}
            >
              <div className="flex items-center justify-end">
                <span className="text-sm text-gray-400 group-hover:hidden">{index + 1}</span>
                <button
                  onClick={() => {
                    if (pt.track) {
                      const allTracks = tracks.filter(p => p.track).map(p => p.track!);
                      const trackIndex = allTracks.findIndex(t => t.id === pt.track!.id);
                      setPlaylistAsQueue(allTracks, trackIndex >= 0 ? trackIndex : 0);
                    }
                  }}
                  className="hidden text-white group-hover:block"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <img
                  src={resolveCoverUrl(pt.track.cover_url || pt.track.album?.cover_url)}
                  alt={pt.track.title}
                  className="h-10 w-10 rounded object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{pt.track.title}</p>
                  <Link to={`/artist/${pt.track.artist_id}`} className="truncate text-xs text-gray-400 hover:underline">{pt.track.artist?.name || 'Unknown Artist'}</Link>
                </div>
              </div>
              <span className="hidden truncate text-sm text-gray-400 md:block">{pt.track.album?.title || 'Unknown Album'}</span>
              <span className="hidden text-sm text-gray-400 md:block">{pt.added_at ? new Date(pt.added_at).toLocaleDateString() : 'Recently'}</span>
              <span className="text-right text-sm text-gray-400">
                {Math.floor(pt.track.duration_seconds / 60)}:{(pt.track.duration_seconds % 60).toString().padStart(2, '0')}
              </span>
              <div className="flex justify-end">
                {isOwner && (
                  <div className="opacity-0 transition-all group-hover:opacity-100">
                    <TrackContextMenu
                      track={pt.track}
                      menuDirection="left"
                      onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
                      onRemoveFromPlaylist={(t) => handleRemoveTrack(String(t.id))}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        ))}
        {tracks.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No tracks in this playlist</p>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-lg bg-gray-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Delete playlist?</h2>
            <p className="mt-2 text-sm text-gray-400">This action cannot be undone. "{playlist.title}" will be permanently deleted.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePlaylist}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowEditModal(false)}>
          <div className="w-full max-w-sm rounded-lg bg-gray-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Edit playlist</h2>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="mt-3 w-full rounded-md bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Playlist title"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditPlaylist(); if (e.key === 'Escape') setShowEditModal(false); }}
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="mt-2 w-full resize-none rounded-md bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Description (optional)"
              rows={2}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleEditPlaylist}
                disabled={!editTitle.trim()}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={() => setPlaylistModalTrack(null)}
        track={playlistModalTrack}
        onCreateNew={() => {
          setPlaylistModalTrack(null);
          setShowCreateModal(true);
        }}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
};

export default PlaylistDetail;
