import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { formatTime } from '../utils/formatTime';
import type { Track } from '../types';

interface TrackItemProps {
  track: Track;
  index?: number;
  onPress: () => void;
  onPlayPress?: () => void;
  showIndex?: boolean;
  isActive?: boolean;
}

export default function TrackItem({ track, index, onPress, onPlayPress, showIndex = false, isActive = false }: TrackItemProps) {
  return (
    <TouchableOpacity style={[styles.container, isActive && styles.activeContainer]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        {showIndex && index !== undefined ? (
          <Text style={[styles.index, isActive && styles.activeText]}>{index + 1}</Text>
        ) : track.cover_url ? (
          <Image source={{ uri: track.cover_url }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="musical-note" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.title, isActive && styles.activeText]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist?.name || 'Unknown Artist'}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.duration}>{formatTime(track.duration_seconds)}</Text>
        {onPlayPress && (
          <TouchableOpacity onPress={onPlayPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  activeContainer: {
    backgroundColor: colors.surface,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  index: {
    width: 24,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
  },
  coverPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
  },
  activeText: {
    color: colors.primary,
  },
  artist: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  duration: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
