import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../api/client';
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
      client.get(`/podcasts/${id}`),
      client.get(`/podcasts/${id}/episodes`),
    ]).then(([p, e]) => {
      setPodcast(p.data);
      setEpisodes(e.data.items || e.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}m`;

  if (loading) return <ActivityIndicator size="large" color="#1DB954" style={styles.loader} />;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#121212', padding: 16 },
  loader: { flex: 1, justifyContent: 'center', backgroundColor: '#121212' },
  back: { marginTop: 8, marginBottom: 8 },
  cover: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  author: { fontSize: 14, color: '#b3b3b3', marginBottom: 16 },
  episode: { backgroundColor: '#181818', borderRadius: 8, padding: 14, marginBottom: 10 },
  epTitle: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  epMeta: { fontSize: 12, color: '#1DB954', marginTop: 4 },
  epDesc: { fontSize: 12, color: '#b3b3b3', marginTop: 6 },
  empty: { textAlign: 'center', color: '#b3b3b3', marginTop: 40 },
});
