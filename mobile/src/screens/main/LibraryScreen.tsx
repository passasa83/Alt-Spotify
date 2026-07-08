import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackItem from '../../components/TrackItem';
import EmptyState from '../../components/EmptyState';
import MiniPlayer from '../../components/MiniPlayer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

type LibraryTab = 'playlists' | 'liked' | 'recent';

export default function LibraryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<LibraryTab>('playlists');
  const { playlists, favorites, loadPlaylists, loadFavorites, isLoading } = useLibraryStore();
  const { currentTrack, setTrack } = usePlayerStore();

  useEffect(() => {
    loadPlaylists();
    loadFavorites();
  }, []);

  const renderPlaylists = () => {
    if (playlists.length === 0) {
      return (
        <EmptyState
          icon="list-outline"
          title="No Playlists"
          message="Create your first playlist to organize your music"
        />
      );
    }
    return (
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.playlistItem}
            onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
          >
            <View style={styles.playlistCover}>
              <Ionicons name="list" size={24} color={colors.textMuted} />
            </View>
            <View style={styles.playlistInfo}>
              <Text style={styles.playlistTitle}>{item.title}</Text>
              <Text style={styles.playlistSubtitle}>{item.description || 'Playlist'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  const renderLiked = () => {
    if (favorites.length === 0) {
      return (
        <EmptyState
          icon="heart-outline"
          title="No Liked Songs"
          message="Songs you like will appear here"
        />
      );
    }
    return (
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => setTrack(item)}
            isActive={currentTrack?.id === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  const renderRecent = () => {
    return (
      <EmptyState
        icon="time-outline"
        title="Recently Played"
        message="Your listening history will appear here"
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Library</Text>
      </View>

      <View style={styles.tabs}>
        {(['playlists', 'liked', 'recent'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab === 'playlists' ? 'Playlists' : tab === 'liked' ? 'Liked Songs' : 'Recent'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'playlists' && renderPlaylists()}
        {activeTab === 'liked' && renderLiked()}
        {activeTab === 'recent' && renderRecent()}
      </View>

      {currentTrack && (
        <MiniPlayer onPress={() => navigation.navigate('FullScreenPlayer')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  listContent: {
    paddingBottom: 100,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  playlistCover: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  playlistSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
