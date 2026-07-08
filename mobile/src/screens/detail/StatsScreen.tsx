import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { getUserStats } from '../../api/users';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { UserStats } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

export default function StatsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await getUserStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  if (loading) return <LoadingSpinner />;
  if (!stats) return <LoadingSpinner />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Stats</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Ionicons name="stats-chart" size={32} color={colors.primary} />
          <Text style={styles.cardTitle}>Total Plays</Text>
          <Text style={styles.cardValue}>{stats.total_plays.toLocaleString()}</Text>
        </View>

        <View style={styles.card}>
          <Ionicons name="time" size={32} color={colors.primary} />
          <Text style={styles.cardTitle}>Time Listened</Text>
          <Text style={styles.cardValue}>{formatHours(stats.total_listening_seconds)}</Text>
        </View>

        <View style={styles.card}>
          <Ionicons name="flame" size={32} color={colors.primary} />
          <Text style={styles.cardTitle}>Day Streak</Text>
          <Text style={styles.cardValue}>{stats.streak} days</Text>
        </View>

        {stats.top_artists.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Artists</Text>
            {stats.top_artists.slice(0, 5).map((artist, index) => (
              <View key={artist.id} style={styles.listItem}>
                <Text style={styles.listRank}>{index + 1}</Text>
                <View style={styles.listInfo}>
                  <Text style={styles.listName}>{artist.name}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {stats.top_tracks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Tracks</Text>
            {stats.top_tracks.slice(0, 5).map((track, index) => (
              <View key={track.id} style={styles.listItem}>
                <Text style={styles.listRank}>{index + 1}</Text>
                <View style={styles.listInfo}>
                  <Text style={styles.listName}>{track.title}</Text>
                  <Text style={styles.listSub}>{track.artist?.name}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {stats.genre_distribution.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Genres</Text>
            {stats.genre_distribution.slice(0, 5).map((genre, index) => (
              <View key={genre.genre} style={styles.genreItem}>
                <Text style={styles.genreName}>{genre.genre}</Text>
                <View style={styles.genreBar}>
                  <View
                    style={[
                      styles.genreBarFill,
                      { width: `${(genre.count / stats.genre_distribution[0].count) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.genreCount}>{genre.count}</Text>
              </View>
            ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  cardValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRank: {
    width: 24,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
  },
  listSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  genreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  genreName: {
    width: 80,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  genreBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.card,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  genreBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  genreCount: {
    width: 40,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
