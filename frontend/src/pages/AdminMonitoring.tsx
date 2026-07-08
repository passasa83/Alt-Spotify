import { useEffect, useState } from 'react';
import client from '@/api/client';
import type { MonitoringHealth, MonitoringStats } from '@/types';
import { Activity, Database, HardDrive, Server, Users, Music, Headphones, RefreshCw } from 'lucide-react';

const AdminMonitoring = () => {
  const [health, setHealth] = useState<MonitoringHealth | null>(null);
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, statsRes] = await Promise.all([
        client.get('/monitoring/health'),
        client.get('/monitoring/stats'),
      ]);
      setHealth(healthRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health && !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error && !health && !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500 bg-green-500/10';
      case 'degraded': return 'text-yellow-500 bg-yellow-500/10';
      case 'unhealthy': return 'text-red-500 bg-red-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={32} className="text-green-500" />
          <h1 className="text-3xl font-bold text-white">System Monitoring</h1>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {health && (
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Service Health</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Object.entries(health.services).map(([name, service]) => (
              <div key={name} className="flex items-center gap-3 rounded-md bg-gray-900 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${getStatusColor(service.status)}`}>
                  {name === 'database' && <Database size={20} />}
                  {name === 'redis' && <Server size={20} />}
                  {name === 'minio' && <HardDrive size={20} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white capitalize">{name}</p>
                  <p className={`text-xs ${getStatusColor(service.status).split(' ')[0]}`}>
                    {service.status}
                  </p>
                  {service.error && (
                    <p className="mt-1 text-xs text-red-400">{service.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Activity size={14} />
            <span>Overall: </span>
            <span className={getStatusColor(health.status).split(' ')[0]}>{health.status}</span>
            <span className="ml-2">Uptime: {formatUptime(health.uptime_seconds)}</span>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Users size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">Active Users</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.active_users}</p>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Music size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">Total Tracks</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.total_tracks}</p>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Headphones size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">Podcasts</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.total_podcasts}</p>
            <p className="text-xs text-gray-500">{stats.total_episodes} episodes</p>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <HardDrive size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">Storage Used</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats.disk_usage ? formatBytes(stats.disk_usage.used_bytes) : 'N/A'}
            </p>
            {stats.disk_usage && (
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${stats.disk_usage.usage_percent}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {stats.disk_usage.usage_percent}% of {formatBytes(stats.disk_usage.total_bytes)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMonitoring;
