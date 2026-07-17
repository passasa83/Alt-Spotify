import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../../api/client';
import { colors } from '../../utils/theme';
import type { Podcast } from '../../types';

export default function PodcastsScreen() {
  const navigation = useNavigation<any>();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/podcasts').then((res) => setPodcasts(res.data.items || res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Podcasts</Text>
      <FlatList
        data={podcasts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PodcastDetail', { id: item.id })}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} /> : <View style={styles.placeholder}><Ionicons name="headphones" size={24} color={colors.text} /></View>}
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
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, padding: 12, marginBottom: 8 },
  image: { width: 64, height: 64, borderRadius: 8 },
  placeholder: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  author: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  episodes: { fontSize: 12, color: colors.primary, marginTop: 4 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
});
