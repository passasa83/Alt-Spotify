import { useEffect, useState } from 'react';
import { getDevices } from '@/api/devices';
import type { Device } from '@/api/devices';
import { Smartphone, Monitor, Laptop } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const AdminDevices = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const data = await getDevices();
        setDevices(data);
      } catch {
        console.error('Failed to load devices');
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile': return <Smartphone size={20} />;
      case 'desktop': return <Laptop size={20} />;
      default: return <Monitor size={20} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">{t('admin.connected_devices')}</h1>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Smartphone size={48} className="mb-4" />
          <p>{t('admin.no_devices')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <div key={device.id} className="rounded-lg bg-gray-900 p-4">
              <div className="flex items-center gap-3">
                <div className="text-green-500">{getDeviceIcon(device.device_type)}</div>
                <div>
                  <p className="font-medium text-white">{device.device_name}</p>
                  <p className="text-sm text-gray-400">{device.device_type}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {t('admin.last_active')}: {new Date(device.last_active_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDevices;
