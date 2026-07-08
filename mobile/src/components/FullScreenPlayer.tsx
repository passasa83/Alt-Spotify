import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { formatTime } from '../utils/formatTime';
import { usePlayerStore } from '../stores/playerStore';

interface FullScreenPlayerProps {
  onClose: () => void;
  onSeek?: (value: number) => void;
}

export default function FullScreenPlayer({ onClose, onSeek }: FullScreenPlayerProps) {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeat,
    volume,
    togglePlay,
    next,
    prev,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    seek,
    toggleLyrics,
    showLyrics,
  } = usePlayerStore();

  if (!currentTrack) return null;

  const handleSeek = (value: number) => {
    seek(value);
    onSeek?.(value);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close player" accessibilityRole="button">
          <Ionicons name="chevron-down" size={32} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="More options" accessibilityRole="button">
          <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.coverContainer}>
        {currentTrack.cover_url ? (
          <Image source={{ uri: currentTrack.cover_url }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="musical-note" size={60} color={colors.textMuted} />
          </View>
        )}
      </View>

      <View style={styles.trackInfo}>
        <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist?.name || 'Unknown Artist'}</Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration}
          value={progress}
          onValueChange={handleSeek}
          minimumTrackTintColor={colors.text}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.text}
          accessibilityLabel="Playback position"
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: duration, now: progress }}
        />
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(progress)}</Text>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleShuffle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Shuffle" accessibilityRole="button" accessibilityState={{ selected: shuffle }}>
          <Ionicons name="shuffle" size={24} color={shuffle ? colors.primary : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={prev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Previous track" accessibilityRole="button">
          <Ionicons name="play-skip-back" size={32} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay} accessibilityLabel={isPlaying ? 'Pause' : 'Play'} accessibilityRole="button">
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={colors.bg} />
        </TouchableOpacity>
        <TouchableOpacity onPress={next} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Next track" accessibilityRole="button">
          <Ionicons name="play-skip-forward" size={32} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleRepeat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={repeat === 'one' ? 'Repeat one' : 'Repeat'} accessibilityRole="button" accessibilityState={{ selected: repeat !== 'off' }}>
          <Ionicons
            name={repeat === 'one' ? 'repeat' : 'repeat'}
            size={24}
            color={repeat !== 'off' ? colors.primary : colors.textSecondary}
          />
          {repeat === 'one' && (
            <Text style={styles.repeatOne}>1</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity onPress={toggleLyrics} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Toggle lyrics" accessibilityRole="button" accessibilityState={{ selected: showLyrics }}>
          <Ionicons name="mic" size={24} color={showLyrics ? colors.primary : colors.textSecondary} />
        </TouchableOpacity>
        <Ionicons name="volume-low" size={20} color={colors.textSecondary} accessibilityLabel="Volume" />
        <Slider
          style={styles.volumeSlider}
          minimumValue={0}
          maximumValue={1}
          value={volume}
          onValueChange={setVolume}
          minimumTrackTintColor={colors.text}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.text}
          accessibilityLabel="Volume slider"
          accessibilityRole="adjustable"
        />
        <Ionicons name="volume-high" size={20} color={colors.textSecondary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coverContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cover: {
    width: 300,
    height: 300,
    borderRadius: borderRadius.lg,
  },
  coverPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  artist: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sliderContainer: {
    marginBottom: spacing.md,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOne: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    top: 2,
    right: 2,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  volumeSlider: {
    flex: 1,
    height: 40,
  },
});
