import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Player from './Player';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import SkipToContent from './SkipToContent';
import MobileNav from './MobileNav';

const Layout = () => {
  const { initDevice } = usePlayerStore();
  const { user, refreshAuth } = useAuthStore();
  const navigate = useNavigate();

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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-y-auto bg-gray-900" role="main">
          <TopBar />
          <div className="p-4 md:p-6" aria-live="polite">
            <Outlet />
          </div>
        </main>
      </div>
      <Player />
      <MobileNav />
    </div>
  );
};

export default Layout;
