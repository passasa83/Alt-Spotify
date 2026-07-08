import { NavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { RootStackParamList } from '../navigation/types';

let navigationRef: NavigationContainerRef<RootStackParamList> | null = null;

export function setNavigationRef(ref: NavigationContainerRef<RootStackParamList>) {
  navigationRef = ref;
}

export function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data;

  if (!data || !navigationRef) return;

  const type = data.type as string | undefined;
  if (!type) return;

  switch (type) {
    case 'jam_invite': {
      const sessionCode = data.session_code as string | undefined;
      const sessionId = data.session_id as string | undefined;
      if (sessionCode || sessionId) {
        navigationRef.navigate('JamSession', { sessionId });
      }
      break;
    }
    case 'new_release': {
      const artistId = data.artist_id as string | undefined;
      if (artistId) {
        navigationRef.navigate('ArtistDetail', { artistId });
      }
      break;
    }
    case 'follow': {
      const followerId = data.follower_id as string | undefined;
      if (followerId) {
        navigationRef.navigate('Main', { screen: 'ProfileTab' });
      }
      break;
    }
    case 'test':
      break;
    default:
      break;
  }
}
