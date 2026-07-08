import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { usePlayerStore } from '../../stores/playerStore';
import { getPlaylist, getPlaylistTracks } from '../../api/playlists';
import TrackItem from '../../components/TrackItem';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Playlist, PlaylistTrack, Track } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

export default function PlaylistDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { playlistId } = route.params;
  const { currentTrack, setTrackAndQueue } = usePlayerStore();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylist();
  }, [playlistId]);

  const loadPlaylist = async () => {
    try {
      const [playlistData, tracksData] = await Promise.all([
        getPlaylist(playlistId),
        getPlaylistTracks(playlistId),
      ]);
      setPlaylist(playlistData);
      setPlaylistTracks(tracksData);
    } catch (error) {
      console.error('Failed to load playlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = () => {
    const tracks = playlistTracks.map((pt) => pt.track).filter(Boolean) as Track[];
    if (tracks.length > 0) {
      setTrackAndQueue(tracks[0], tracks.slice(1));
    }
  };

  const handleTrackPress = (track: Track, index: number) => {
    const tracks = playlistTracks.map((pt) => pt.track).filter(Boolean) as Track[];
    setTrackAndQueue(track, tracks.slice(index + 1));
  };

  if (loading || !playlist) return <LoadingSpinner />;

  const tracks = playlistTracks.map((pt) => pt.track).filter(Boolean) as Track[];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-down" size={32} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.playlistHeader}>
            <View style={styles.coverContainer}>
              <Ionicons name="list" size={60} color={colors.textMuted} />
            </View>
            <Text style={styles.title} numberOfLines={1}>{playlist.title}</Text>
            {playlist.description && (
              <Text style={styles.description} numberOfLines={2}>{playlist.description}</Text>
            )}
            <Text style={styles.trackCount}>{tracks.length} songs</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => handleTrackPress(item, index)}
            isActive={currentTrack?.id === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <TouchableOpacity style={styles.playAllButton} onPress={handlePlayAll}>
            <Ionicons name="play" size={24} color={colors.bg} />
            <Text style={styles.playAllText}>Play All</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playlistHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  coverContainer: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  trackCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingBottom: 100,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  playAllText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.bg,
  },
});
