import client from './client';

export interface Device {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  is_active: boolean;
  last_active_at: string;
  is_current: boolean;
}

export const registerDevice = async (deviceId: string, deviceName: string, deviceType: string): Promise<Device> => {
  const response = await client.post('/devices/register', {
    device_id: deviceId,
    device_name: deviceName,
    device_type: deviceType,
  });
  return response.data;
};

export const getDevices = async (): Promise<Device[]> => {
  const response = await client.get('/devices');
  return response.data;
};

export const sendHeartbeat = async (deviceId: string): Promise<void> => {
  await client.post('/devices/heartbeat', { device_id: deviceId });
};

export const transferPlayback = async (deviceId: string): Promise<void> => {
  await client.post(`/devices/${deviceId}/transfer`);
};
