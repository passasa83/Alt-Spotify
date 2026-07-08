import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { usePlayerStore } from '../../stores/playerStore';
import { getAlbum, getAlbumTracks } from '../../api/albums';
import TrackItem from '../../components/TrackItem';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Album, Track } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AlbumDetail'>;

export default function AlbumDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { albumId } = route.params;
  const { currentTrack, setTrackAndQueue } = usePlayerStore();
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlbum();
  }, [albumId]);

  const loadAlbum = async () => {
    try {
      const [albumData, tracksData] = await Promise.all([
        getAlbum(albumId),
        getAlbumTracks(albumId),
      ]);
      setAlbum(albumData);
      setTracks(tracksData);
    } catch (error) {
      console.error('Failed to load album:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setTrackAndQueue(tracks[0], tracks.slice(1));
    }
  };

  const handleTrackPress = (track: Track, index: number) => {
    setTrackAndQueue(track, tracks.slice(index + 1));
  };

  if (loading || !album) return <LoadingSpinner />;

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
          <View style={styles.albumHeader}>
            {album.cover_url ? (
              <Image source={{ uri: album.cover_url }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Ionicons name="disc" size={60} color={colors.textMuted} />
              </View>
            )}
            <Text style={styles.title} numberOfLines={1}>{album.title}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ArtistDetail', { artistId: album.artist_id })}>
              <Text style={styles.artist} numberOfLines={1}>{album.artist?.name || 'Unknown Artist'}</Text>
            </TouchableOpacity>
            {album.release_date && (
              <Text style={styles.year}>{new Date(album.release_date).getFullYear()}</Text>
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
  albumHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  cover: {
    width: 240,
    height: 240,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  coverPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  artist: {
    fontSize: fontSize.md,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  year: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
