import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { formatTime } from '../utils/formatTime';
import { usePlayerStore } from '../stores/playerStore';
import CoverImage from './CoverImage';

interface MiniPlayerProps {
  onPress: () => void;
}

export default function MiniPlayer({ onPress }: MiniPlayerProps) {
  const { currentTrack, isPlaying, progress, duration, togglePlay } = usePlayerStore();

  if (!currentTrack) return null;

  const progressValue = duration > 0 ? progress / duration : 0;

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.progressBar}>
        <View style={[styles.progress, { height: 2, backgroundColor: colors.border }]}>
          <View style={{ height: 2, width: `${Math.min(100, progressValue * 100)}%`, backgroundColor: colors.primary }} />
        </View>
      </View>
      <View style={styles.content}>
        {currentTrack.cover_url ? (
          <CoverImage uri={currentTrack.cover_url} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="musical-note" size={16} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist?.name || 'Unknown'}</Text>
        </View>
        <TouchableOpacity onPress={togglePlay} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={28}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
  },
  progress: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  coverPlaceholder: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  artist: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
