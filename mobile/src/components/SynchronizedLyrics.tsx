import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, fontSize } from '../utils/theme';
import type { LyricsLine } from '../types';

interface SynchronizedLyricsProps {
  lyrics: LyricsLine[];
  currentTime: number;
}

export default function SynchronizedLyrics({ lyrics, currentTime }: SynchronizedLyricsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lineRefs = useRef<(View | null)[]>([]);

  const currentLineIndex = lyrics.findIndex((line, index) => {
    const nextLine = lyrics[index + 1];
    return currentTime >= line.time_seconds && (!nextLine || currentTime < nextLine.time_seconds);
  });

  useEffect(() => {
    if (currentLineIndex >= 0 && lineRefs.current[currentLineIndex]) {
      lineRefs.current[currentLineIndex]?.measureLayout(
        scrollRef.current as any,
        (x, y) => {
          scrollRef.current?.scrollTo({ y: y - 100, animated: true });
        },
        () => {}
      );
    }
  }, [currentLineIndex]);

  if (!lyrics.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No lyrics available</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      {lyrics.map((line, index) => (
        <View
          key={index}
          ref={(ref) => { lineRefs.current[index] = ref; }}
          style={[
            styles.line,
            index === currentLineIndex && styles.currentLine,
          ]}
        >
          <Text
            style={[
              styles.lineText,
              index === currentLineIndex && styles.currentLineText,
              index < currentLineIndex && styles.pastLineText,
            ]}
          >
            {line.text || '...'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: spacing.xxl,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  line: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  currentLine: {
    transform: [{ scale: 1.05 }],
  },
  lineText: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  currentLineText: {
    color: colors.text,
    fontWeight: '700',
  },
  pastLineText: {
    color: colors.textSecondary,
  },
});
