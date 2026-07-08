import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';

const TARGET_LUFS = -14;
const REFERENCE_LUFS = -14;

export const useReplayGain = (audioRef: React.RefObject<HTMLAudioElement | null>) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const replayGainEnabled = usePlayerStore((s) => s.replayGainEnabled);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  useEffect(() => {
    if (!audioRef.current || !replayGainEnabled) return;

    const audio = audioRef.current;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(audio);
    }
    if (!gainNodeRef.current) {
      gainNodeRef.current = ctx.createGain();
    }

    const source = sourceNodeRef.current;
    const gainNode = gainNodeRef.current;

    source.disconnect();
    gainNode.disconnect();

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    return () => {
      gainNode.gain.value = 1;
    };
  }, [replayGainEnabled]);

  useEffect(() => {
    if (!gainNodeRef.current || !replayGainEnabled) return;

    const track = currentTrack as any;
    if (!track?.track_gain && track?.track_gain !== 0) {
      gainNodeRef.current.gain.value = 1;
      return;
    }

    const gain = track.track_gain;
    const peak = track.track_peak;

    let adjustedGain = gain - (TARGET_LUFS - REFERENCE_LUFS);

    const gainLinear = Math.pow(10, adjustedGain / 20);

    if (peak && peak > 0) {
      const maxGain = 1 / peak;
      gainNodeRef.current.gain.value = Math.min(gainLinear, maxGain);
    } else {
      gainNodeRef.current.gain.value = Math.min(Math.max(gainLinear, 0), 2);
    }
  }, [currentTrack, replayGainEnabled]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);
};
