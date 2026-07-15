import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../api/client';
import type { Podcast } from '../../types';

export default function PodcastsScreen() {
  const navigation = useNavigation<any>();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/podcasts').then((res) => setPodcasts(res.data.items || res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#1DB954" style={styles.loader} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Podcasts</Text>
      <FlatList
        data={podcasts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PodcastDetail', { id: item.id })}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} /> : <View style={styles.placeholder}><Ionicons name="headphones" size={24} color="#fff" /></View>}
            <View style={styles.info}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.author} numberOfLines={1}>{item.author || 'Unknown'}</Text>
              <Text style={styles.episodes}>{item.episode_count} episodes</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No podcasts yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  card: { flexDirection: 'row', backgroundColor: '#181818', borderRadius: 8, padding: 12, marginBottom: 8 },
  image: { width: 64, height: 64, borderRadius: 8 },
  placeholder: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  author: { fontSize: 13, color: '#b3b3b3', marginTop: 2 },
  episodes: { fontSize: 12, color: '#1DB954', marginTop: 4 },
  empty: { textAlign: 'center', color: '#b3b3b3', marginTop: 40 },
});
