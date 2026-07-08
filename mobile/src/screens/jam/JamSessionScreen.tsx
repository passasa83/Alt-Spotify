import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';
import { createJamSession, joinJamSession, leaveJamSession, getJamSession } from '../../api/jam';
import { usePlayerStore } from '../../stores/playerStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { JamSession as JamSessionType, JamParticipant, Track } from '../../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JamSession'>;

export default function JamSessionScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { sessionId } = route.params || {};
  const { currentTrack, isPlaying, togglePlay, next } = usePlayerStore();
  const [session, setSession] = useState<JamSessionType | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  const loadSession = async (id: string) => {
    setLoading(true);
    try {
      const data = await getJamSession(id);
      setSession(data);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const newSession = await createJamSession();
      setSession(newSession);
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSession = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    try {
      const joinedSession = await joinJamSession(joinCode.trim());
      setSession(joinedSession);
    } catch (error) {
      console.error('Failed to join session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveSession = async () => {
    if (!session) return;
    try {
      await leaveJamSession(session.id);
      setSession(null);
    } catch (error) {
      console.error('Failed to leave session:', error);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Jam Session</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.joinContainer}>
          <Ionicons name="people-circle" size={80} color={colors.primary} />
          <Text style={styles.joinTitle}>Start a Jam Session</Text>
          <Text style={styles.joinSubtitle}>Listen together with friends in real-time</Text>

          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateSession}
            disabled={creating}
          >
            <Ionicons name="add-circle" size={24} color={colors.bg} />
            <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create Session'}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.joinLabel}>Join an existing session</Text>
          <View style={styles.joinInputRow}>
            <TextInput
              style={styles.joinInput}
              placeholder="Enter code"
              placeholderTextColor={colors.textMuted}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.joinButton} onPress={handleJoinSession}>
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Jam Session</Text>
        <TouchableOpacity onPress={handleLeaveSession}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sessionInfo}>
        <Text style={styles.sessionCode}>Code: {session.code}</Text>
        <Text style={styles.sessionStatus}>{session.participants.length} participants</Text>
      </View>

      <View style={styles.participantsSection}>
        <Text style={styles.sectionTitle}>Participants</Text>
        {session.participants.map((participant) => (
          <View key={participant.user_id} style={styles.participantItem}>
            <View style={styles.participantAvatar}>
              <Ionicons name="person" size={20} color={colors.textMuted} />
            </View>
            <Text style={styles.participantName}>{participant.username}</Text>
            {participant.role === 'host' && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>Host</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {session.queue.length > 0 && (
        <View style={styles.queueSection}>
          <Text style={styles.sectionTitle}>Queue</Text>
          {session.queue.slice(0, 5).map((track, index) => (
            <View key={track.id} style={styles.queueItem}>
              <Text style={styles.queueIndex}>{index + 1}</Text>
              <View style={styles.queueInfo}>
                <Text style={styles.queueTrack} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.queueArtist} numberOfLines={1}>{track.artist?.name}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {currentTrack && (
        <View style={styles.nowPlaying}>
          <Text style={styles.nowPlayingLabel}>Now Playing</Text>
          <Text style={styles.nowPlayingTrack}>{currentTrack.title}</Text>
          <View style={styles.controls}>
            <TouchableOpacity onPress={togglePlay}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={next}>
              <Ionicons name="play-skip-forward" size={32} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
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
  leaveText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '500',
  },
  joinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  joinTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  joinSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  createButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.bg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  joinLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
  joinInputRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  joinInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
    letterSpacing: 4,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.bg,
  },
  sessionInfo: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  sessionCode: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 4,
  },
  sessionStatus: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  participantsSection: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  participantName: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  hostBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  hostBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.bg,
  },
  queueSection: {
    padding: spacing.md,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueIndex: {
    width: 24,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  queueInfo: {
    flex: 1,
  },
  queueTrack: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
  },
  queueArtist: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  nowPlaying: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: 'auto',
    marginBottom: spacing.lg,
  },
  nowPlayingLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nowPlayingTrack: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
});
