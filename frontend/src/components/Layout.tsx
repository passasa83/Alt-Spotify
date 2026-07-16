import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Player from './Player';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import SkipToContent from './SkipToContent';

const Layout = () => {
  const { showLyrics, lyrics, initDevice } = usePlayerStore();
  const { user, refreshAuth } = useAuthStore();
  const navigate = useNavigate();
  const lyricsHeight = showLyrics && lyrics.length > 0 ? 256 : 0;

  useEffect(() => {
    if (!user) {
      refreshAuth().catch(() => {
        navigate('/login', { replace: true });
      });
    }
  }, [user, refreshAuth, navigate]);

  useEffect(() => {
    initDevice();
  }, [initDevice]);

  return (
    <div className="flex h-screen flex-col bg-black">
      <SkipToContent />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-y-auto bg-gray-900" role="main">
          <TopBar />
          <div className="p-6" aria-live="polite">
            <Outlet />
          </div>
        </main>
      </div>
      <div style={{ marginBottom: `${lyricsHeight}px` }} />
      <Player />
    </div>
  );
};

export default Layout;
