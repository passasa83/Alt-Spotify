import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getTrack, getTrackLyricsParsed } from '../../api/tracks';
import { formatTime } from '../../utils/formatTime';
import SynchronizedLyrics from '../../components/SynchronizedLyrics';
import type { Track, LyricsLine } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TrackDetail'>;

export default function TrackDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { track: initialTrack } = route.params;
  const { currentTrack, isPlaying, setTrack, togglePlay, addToQueue } = usePlayerStore();
  const { isFavorite, addToFavorites, removeFromFavorites } = useLibraryStore();
  const [lyrics, setLyrics] = useState<LyricsLine[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);

  const track = currentTrack?.id === initialTrack.id ? currentTrack : initialTrack;
  const isActive = currentTrack?.id === track.id;

  useEffect(() => {
    loadLyrics();
  }, [track.id]);

  const loadLyrics = async () => {
    try {
      const parsed = await getTrackLyricsParsed(track.id);
      setLyrics(parsed);
    } catch {}
  };

  const handlePlay = () => {
    if (isActive) {
      togglePlay();
    } else {
      setTrack(track);
    }
  };

  const handleFavorite = () => {
    if (isFavorite(track.id)) {
      removeFromFavorites(track.id);
    } else {
      addToFavorites(track);
    }
  };

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {track.cover_url ? (
          <Image source={{ uri: track.cover_url }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="musical-note" size={60} color={colors.textMuted} />
          </View>
        )}

        <View style={styles.trackInfo}>
          <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{track.artist?.name || 'Unknown Artist'}</Text>
          <Text style={styles.album} numberOfLines={1}>{track.album?.title || ''}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleFavorite}>
            <Ionicons
              name={isFavorite(track.id) ? 'heart' : 'heart-outline'}
              size={28}
              color={isFavorite(track.id) ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => addToQueue(track)}>
            <Ionicons name="add-circle-outline" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity>
            <Ionicons name="share-outline" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Duration</Text>
            <Text style={styles.infoValue}>{formatTime(track.duration_seconds)}</Text>
          </View>
          {track.genre && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Genre</Text>
              <Text style={styles.infoValue}>{track.genre}</Text>
            </View>
          )}
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Plays</Text>
            <Text style={styles.infoValue}>{track.play_count.toLocaleString()}</Text>
          </View>
        </View>

        {lyrics.length > 0 && (
          <View style={styles.lyricsSection}>
            <TouchableOpacity style={styles.lyricsToggle} onPress={() => setShowLyrics(!showLyrics)}>
              <Ionicons name="mic" size={24} color={colors.primary} />
              <Text style={styles.lyricsToggleText}>
                {showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
              </Text>
            </TouchableOpacity>
            {showLyrics && (
              <View style={styles.lyricsContainer}>
                <SynchronizedLyrics lyrics={lyrics} currentTime={isActive ? usePlayerStore.getState().progress : 0} />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.playContainer}>
        <TouchableOpacity style={styles.playButton} onPress={handlePlay}>
          <Ionicons name={isActive && isPlaying ? 'pause' : 'play'} size={32} color={colors.bg} />
        </TouchableOpacity>
      </View>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  cover: {
    width: 280,
    height: 280,
    borderRadius: borderRadius.lg,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  coverPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  artist: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  album: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  lyricsSection: {
    marginTop: spacing.md,
  },
  lyricsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  lyricsToggleText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  lyricsContainer: {
    height: 300,
    marginTop: spacing.sm,
  },
  playContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
