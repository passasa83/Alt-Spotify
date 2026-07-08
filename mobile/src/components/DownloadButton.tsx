import React, { useState, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadTrack, removeDownload, isTrackDownloaded } from '../services/offlineStorage';
import { getTrackStreamUrl } from '../api/tracks';

interface Props {
  trackId: string;
  color?: string;
  size?: number;
}

export default function DownloadButton({ trackId, color = '#9ca3af', size = 20 }: Props) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    isTrackDownloaded(trackId).then(setIsDownloaded);
  }, [trackId]);

  const handlePress = async () => {
    if (isDownloaded) {
      await removeDownload(trackId);
      setIsDownloaded(false);
      return;
    }

    setIsDownloading(true);
    try {
      const streamUrl = getTrackStreamUrl(trackId);
      const userId = 'current-user-id';
      const deviceId = 'mobile-device-id';
      await downloadTrack(trackId, streamUrl, userId, deviceId);
      setIsDownloaded(true);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isDownloading) {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons
        name={isDownloaded ? 'checkmark-circle' : 'download-outline'}
        size={size}
        color={isDownloaded ? '#1db954' : color}
      />
    </TouchableOpacity>
  );
}
