import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { usePlayerStore } from '../../stores/playerStore';
import { getArtist, getArtistAlbums, getArtistTopTracks } from '../../api/artists';
import TrackItem from '../../components/TrackItem';
import AlbumCard from '../../components/AlbumCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Artist, Album, Track } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ArtistDetail'>;

export default function ArtistDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { artistId } = route.params;
  const { currentTrack, setTrackAndQueue } = usePlayerStore();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArtist();
  }, [artistId]);

  const loadArtist = async () => {
    try {
      const [artistData, albumsRes, tracksData] = await Promise.all([
        getArtist(artistId),
        getArtistAlbums(artistId),
        getArtistTopTracks(artistId),
      ]);
      setArtist(artistData);
      setAlbums(albumsRes.items);
      setTopTracks(tracksData);
    } catch (error) {
      console.error('Failed to load artist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track, index: number) => {
    setTrackAndQueue(track, topTracks.slice(index + 1));
  };

  if (loading || !artist) return <LoadingSpinner />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-down" size={32} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.artistHeader}>
          {artist.image_url ? (
            <Image source={{ uri: artist.image_url }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="person" size={60} color={colors.textMuted} />
            </View>
          )}
          <Text style={styles.name}>{artist.name}</Text>
          {artist.bio && (
            <Text style={styles.bio} numberOfLines={3}>{artist.bio}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Tracks</Text>
          {topTracks.slice(0, 5).map((track, index) => (
            <TrackItem
              key={track.id}
              track={track}
              index={index}
              showIndex
              onPress={() => handleTrackPress(track, index)}
              isActive={currentTrack?.id === track.id}
            />
          ))}
        </View>

        {albums.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Discography</Text>
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
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: {
    paddingBottom: 100,
  },
  artistHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: spacing.lg,
  },
  imagePlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  bio: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});
