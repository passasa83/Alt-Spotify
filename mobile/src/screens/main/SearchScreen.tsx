import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import SearchBar from '../../components/SearchBar';
import TrackItem from '../../components/TrackItem';
import AlbumCard from '../../components/AlbumCard';
import ArtistCard from '../../components/ArtistCard';
import PlaylistCard from '../../components/PlaylistCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useSearch } from '../../hooks/useSearch';
import { usePlayerStore } from '../../stores/playerStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GENRES = [
  { id: '1', name: 'Pop', color: '#E13300' },
  { id: '2', name: 'Hip-Hop', color: '#BA5D07' },
  { id: '3', name: 'Rock', color: '#E91429' },
  { id: '4', name: 'Electronic', color: '#148A08' },
  { id: '5', name: 'R&B', color: '#DC148C' },
  { id: '6', name: 'Jazz', color: '#477D95' },
  { id: '7', name: 'Classical', color: '#7D4B32' },
  { id: '8', name: 'Metal', color: '#1E3264' },
];

export default function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { query, setQuery, results, isLoading } = useSearch();
  const { setTrack } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<'all' | 'tracks' | 'artists' | 'albums' | 'playlists'>('all');

  const hasResults = results.tracks.length > 0 || results.artists.length > 0 || results.albums.length > 0 || results.playlists.length > 0;

  const renderContent = () => {
    if (isLoading) return <LoadingSpinner />;
    if (!query.trim()) {
      return (
        <View style={styles.genreContainer}>
          <Text style={styles.genreTitle}>Browse All</Text>
          <View style={styles.genreGrid}>
            {GENRES.map((genre) => (
              <TouchableOpacity key={genre.id} style={[styles.genreCard, { backgroundColor: genre.color }]}>
                <Text style={styles.genreName}>{genre.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    if (!hasResults) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>No results found for "{query}"</Text>
        </View>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === 'all' || activeTab === 'tracks' ? (
          results.tracks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Songs</Text>
              {results.tracks.slice(0, 5).map((track, index) => (
                <TrackItem
                  key={track.id}
                  track={track}
                  index={index}
                  showIndex
                  onPress={() => setTrack(track)}
                  isActive={false}
                />
              ))}
            </View>
          )
        ) : null}

        {activeTab === 'all' || activeTab === 'artists' ? (
          results.artists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Artists</Text>
              <FlatList
                horizontal
                data={results.artists}
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
          )
        ) : null}

        {activeTab === 'all' || activeTab === 'albums' ? (
          results.albums.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Albums</Text>
              <FlatList
                horizontal
                data={results.albums}
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
          )
        ) : null}

        {activeTab === 'all' || activeTab === 'playlists' ? (
          results.playlists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Playlists</Text>
              <FlatList
                horizontal
                data={results.playlists}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <PlaylistCard
                    playlist={item}
                    onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )
        ) : null}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.searchHeader}>
        <SearchBar value={query} onChangeText={setQuery} autoFocus />
      </View>

      {query.trim() && (
        <View style={styles.tabs}>
          {(['all', 'tracks', 'artists', 'albums', 'playlists'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
  },
  activeTab: {
    backgroundColor: colors.text,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.bg,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  genreContainer: {
    padding: spacing.md,
  },
  genreTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  genreCard: {
    width: '48%',
    height: 100,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  genreName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
