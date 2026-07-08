import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Home from '@/pages/Home';
import SearchPage from '@/pages/Search';
import Library from '@/pages/Library';
import PlaylistDetail from '@/pages/PlaylistDetail';
import TrackDetail from '@/pages/TrackDetail';
import ArtistDetail from '@/pages/ArtistDetail';
import AlbumDetail from '@/pages/AlbumDetail';
import Settings from '@/pages/Settings';
import JamSession from '@/pages/JamSession';
import Stats from '@/pages/Stats';
import AdminUpload from '@/pages/AdminUpload';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminUsers from '@/pages/AdminUsers';
import AdminCatalogue from '@/pages/AdminCatalogue';
import Podcasts from '@/pages/Podcasts';
import PodcastDetail from '@/pages/PodcastDetail';
import EpisodeDetail from '@/pages/EpisodeDetail';
import AdminMonitoring from '@/pages/AdminMonitoring';
import NotFound from '@/pages/NotFound';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="library" element={<Library />} />
        <Route path="playlist/:id" element={<PlaylistDetail />} />
        <Route path="track/:id" element={<TrackDetail />} />
        <Route path="artist/:id" element={<ArtistDetail />} />
        <Route path="album/:id" element={<AlbumDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="jam" element={<JamSession />} />
        <Route path="jam/:sessionId" element={<JamSession />} />
        <Route path="stats" element={<Stats />} />
        <Route path="podcasts" element={<Podcasts />} />
        <Route path="podcasts/:id" element={<PodcastDetail />} />
        <Route path="podcasts/episode/:id" element={<EpisodeDetail />} />
        <Route path="admin/upload" element={<AdminUpload />} />
        <Route path="admin/dashboard" element={<AdminDashboard />} />
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="admin/catalogue" element={<AdminCatalogue />} />
        <Route path="admin/monitoring" element={<AdminMonitoring />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default App;
