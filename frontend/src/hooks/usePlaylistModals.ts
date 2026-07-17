import { useState } from 'react';
import type { Track } from '@/types';

export const usePlaylistModals = () => {
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const openAddToPlaylist = (track: Track) => setPlaylistModalTrack(track);
  const openCreatePlaylist = () => {
    setPlaylistModalTrack(null);
    setShowCreateModal(true);
  };
  const closeAddToPlaylist = () => setPlaylistModalTrack(null);
  const closeCreatePlaylist = () => setShowCreateModal(false);

  return {
    playlistModalTrack,
    showCreateModal,
    openAddToPlaylist,
    openCreatePlaylist,
    closeAddToPlaylist,
    closeCreatePlaylist,
  };
};
