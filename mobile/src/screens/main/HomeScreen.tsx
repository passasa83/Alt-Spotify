import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize } from '../../utils/theme';
import { useAuthStore } from '../../stores/authStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackItem from '../../components/TrackItem';
import AlbumCard from '../../components/AlbumCard';
import ArtistCard from '../../components/ArtistCard';
import MiniPlayer from '../../components/MiniPlayer';
import { getTracks } from '../../api/tracks';
import { getAlbums } from '../../api/albums';
import { getArtists } from '../../api/artists';
import type { Track, Album, Artist } from '../../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { currentTrack } = usePlayerStore();
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tracksRes, albumsRes, artistsRes] = await Promise.all([
        getTracks(1, 10),
        getAlbums(1, 10),
        getArtists(1, 10),
      ]);
      setRecentTracks(tracksRes.items);
      setAlbums(albumsRes.items);
      setArtists(artistsRes.items);
    } catch (error) {
      console.error('Failed to load home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleTrackPress = (track: Track) => {
    usePlayerStore.getState().setTrack(track);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.username}>{user?.pseudo || 'Music Lover'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recently Played</Text>
          {recentTracks.length > 0 ? (
            <View style={styles.trackGrid}>
              {recentTracks.slice(0, 6).map((track) => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.trackGridItem}
                  onPress={() => handleTrackPress(track)}
                >
                  <View style={styles.trackGridCover}>
                    <Ionicons name="musical-note" size={24} color={colors.textMuted} />
                  </View>
                  <Text style={styles.trackGridTitle} numberOfLines={1}>{track.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Start listening to see your history</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Releases</Text>
          <FlatList
            horizontal
            data={albums}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <AlbumCard
                album={item}
                onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id })}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Featured Artists</Text>
          <FlatList
            horizontal
            data={artists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ArtistCard
                artist={item}
                onPress={() => navigation.navigate('ArtistDetail', { artistId: item.id })}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Tracks</Text>
          {recentTracks.slice(0, 5).map((track, index) => (
            <TrackItem
              key={track.id}
              track={track}
              index={index}
              showIndex
              onPress={() => handleTrackPress(track)}
              isActive={currentTrack?.id === track.id}
            />
          ))}
        </View>
      </ScrollView>

      {currentTrack && (
        <MiniPlayer onPress={() => navigation.navigate('FullScreenPlayer')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  username: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  trackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  trackGridItem: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackGridCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  trackGridTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
});
