import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../../api/client';
import { getPodcast, getPodcastEpisodes } from '../../api/podcasts';
import { formatDuration } from '../../utils/formatTime';
import { colors } from '../../utils/theme';
import type { Episode } from '../../types';

export default function PodcastDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { id } = route.params;
  const [podcast, setPodcast] = useState<any>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getPodcast(id),
      getPodcastEpisodes(id),
    ]).then(([p, e]) => {
      setPodcast(p);
      setEpisodes(e.items || e);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
      {podcast?.image_url && <Image source={{ uri: podcast.image_url }} style={styles.cover} />}
      <Text style={styles.title}>{podcast?.title}</Text>
      <Text style={styles.author}>{podcast?.author}</Text>
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.episode}>
            <Text style={styles.epTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.epMeta}>Ep. {item.episode_number || '-'} · {formatDuration(item.duration_seconds)}</Text>
            <Text style={styles.epDesc} numberOfLines={2}>{item.description}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No episodes</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  loader: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
  back: { marginTop: 8, marginBottom: 8 },
  cover: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  author: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
  episode: { backgroundColor: colors.surface, borderRadius: 8, padding: 14, marginBottom: 10 },
  epTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  epMeta: { fontSize: 12, color: colors.primary, marginTop: 4 },
  epDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
});
