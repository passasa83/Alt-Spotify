import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from './src/stores/authStore';
import { usePlayerStore } from './src/stores/playerStore';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import FullScreenPlayer from './src/components/FullScreenPlayer';
import MiniPlayer from './src/components/MiniPlayer';
import LoadingSpinner from './src/components/LoadingSpinner';
import { configureBackgroundAudio } from './src/services/backgroundAudio';
import { useAudioPlayer } from './src/hooks/useAudioPlayer';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { setNavigationRef } from './src/services/notificationHandler';
import type { RootStackParamList } from './src/navigation/types';
import { Modal, View, StyleSheet } from 'react-native';
import { colors } from './src/utils/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Height of the bottom tab bar (MainNavigator): the mini player sits on top of it.
const TAB_BAR_HEIGHT = 85;

/** Plays the audio and shows the mini player / full-screen player over the app. */
function PlayerHost() {
  const { seekTo } = useAudioPlayer();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [fullScreen, setFullScreen] = useState(false);

  if (!currentTrack) return null;
  return (
    <>
      <View style={styles.miniPlayerDock} pointerEvents="box-none">
        <MiniPlayer onPress={() => setFullScreen(true)} />
      </View>
      <Modal
        visible={fullScreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullScreen(false)}
      >
        <FullScreenPlayer onClose={() => setFullScreen(false)} onSeek={seekTo} />
      </Modal>
    </>
  );
}

function MainApp() {
  const { isAuthenticated, isLoading, restoreSession } = useAuthStore();
  const [ready, setReady] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  usePushNotifications();

  useEffect(() => {
    const init = async () => {
      await configureBackgroundAudio();
      await restoreSession();
      setReady(true);
    };
    init();
  }, []);

  if (!ready || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef} onReady={() => setNavigationRef(navigationRef)}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainNavigator} />
              <Stack.Screen
                name="TrackDetail"
                component={require('./src/screens/detail/TrackDetailScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="AlbumDetail"
                component={require('./src/screens/detail/AlbumDetailScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="ArtistDetail"
                component={require('./src/screens/detail/ArtistDetailScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="PlaylistDetail"
                component={require('./src/screens/detail/PlaylistDetailScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Stats"
                component={require('./src/screens/detail/StatsScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="JamSession"
                component={require('./src/screens/jam/JamSessionScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="PodcastDetail"
                component={require('./src/screens/detail/PodcastDetailScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Settings"
                component={require('./src/screens/settings/SettingsScreen').default}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
            </>
          )}
        </Stack.Navigator>
        {isAuthenticated && <PlayerHost />}
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  miniPlayerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: TAB_BAR_HEIGHT + 4,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
