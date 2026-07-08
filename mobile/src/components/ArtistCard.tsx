import React from 'react';
import { Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import type { Artist } from '../types';

interface ArtistCardProps {
  artist: Artist;
  onPress: () => void;
  size?: number;
}

export default function ArtistCard({ artist, onPress, size = 120 }: ArtistCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {artist.image_url ? (
        <Image source={{ uri: artist.image_url }} style={[styles.image, { width: size, height: size }]} />
      ) : (
        <View style={[styles.image, styles.placeholder, { width: size, height: size }]}>
          <Ionicons name="person" size={size * 0.4} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>{artist.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: spacing.md,
  },
  image: {
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  placeholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
    maxWidth: 120,
  },
});
