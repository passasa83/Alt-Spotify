import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotifications,
  sendPushTokenToServer,
  removePushTokenFromServer,
  addPushNotificationListener,
  addNotificationResponseListener,
} from '../services/pushNotifications';
import { handleNotificationResponse } from '../services/notificationHandler';
import { useAuthStore } from '../stores/authStore';
import type * as Notifications from 'expo-notifications';

export function usePushNotifications() {
  const { isAuthenticated } = useAuthStore();
  const tokenRef = useRef<string | null>(null);
  const listenersRef = useRef<{
    received?: Notifications.Subscription;
    response?: Notifications.Subscription;
  }>({});

  useEffect(() => {
    if (!isAuthenticated) {
      cleanup();
      return;
    }

    setupNotifications();

    return () => {
      cleanup();
    };
  }, [isAuthenticated]);

  async function setupNotifications() {
    const token = await registerForPushNotifications();
    if (token) {
      tokenRef.current = token;
      await AsyncStorage.setItem('push_token', token);
      await sendPushTokenToServer(token);
    }

    listenersRef.current.received = addPushNotificationListener((notification) => {
      // In-app notification banner handled by Notifications.setNotificationHandler
    });

    listenersRef.current.response = addNotificationResponseListener((response) => {
      handleNotificationResponse(response);
    });
  }

  async function cleanup() {
    if (listenersRef.current.received) {
      listenersRef.current.received.remove();
    }
    if (listenersRef.current.response) {
      listenersRef.current.response.remove();
    }

    const storedToken = tokenRef.current || (await AsyncStorage.getItem('push_token'));
    if (storedToken) {
      await removePushTokenFromServer(storedToken);
      await AsyncStorage.removeItem('push_token');
    }
    tokenRef.current = null;
  }

  async function refreshToken() {
    const token = await registerForPushNotifications();
    if (token) {
      const oldToken = tokenRef.current;
      if (oldToken) {
        await removePushTokenFromServer(oldToken);
      }
      tokenRef.current = token;
      await AsyncStorage.setItem('push_token', token);
      await sendPushTokenToServer(token);
    }
  }

  return { refreshToken };
}
