import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import type { Playlist } from '../types';

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: () => void;
  trackCount?: number;
}

export default function PlaylistCard({ playlist, onPress, trackCount }: PlaylistCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.coverContainer}>
        <Ionicons name="list" size={30} color={colors.textMuted} />
      </View>
      <Text style={styles.title} numberOfLines={1}>{playlist.title}</Text>
      <Text style={styles.count} numberOfLines={1}>
        {trackCount !== undefined ? `${trackCount} tracks` : playlist.description || 'Playlist'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 150,
    marginRight: spacing.md,
  },
  coverContainer: {
    width: 150,
    height: 150,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  count: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
