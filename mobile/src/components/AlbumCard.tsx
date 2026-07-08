import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import type { Album } from '../types';

interface AlbumCardProps {
  album: Album;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export default function AlbumCard({ album, onPress, size = 'medium' }: AlbumCardProps) {
  const dimensions = size === 'small' ? 120 : size === 'medium' ? 150 : 180;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {album.cover_url ? (
        <Image source={{ uri: album.cover_url }} style={[styles.cover, { width: dimensions, height: dimensions }]} />
      ) : (
        <View style={[styles.cover, styles.placeholder, { width: dimensions, height: dimensions }]}>
          <Ionicons name="disc" size={40} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>{album.title}</Text>
      <Text style={styles.artist} numberOfLines={1}>{album.artist?.name || 'Unknown Artist'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
    width: 150,
  },
  cover: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  placeholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  artist: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
