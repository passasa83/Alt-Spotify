import { usePlayerStore, type RepeatMode } from '@/stores/playerStore';
import type { Track } from '@/types';
import { addFavorite, removeFavorite, checkFavorite } from '@/api/favorites';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Mic2,
  Radio,
  Download,
  Sliders,
  Settings2,
  Gauge,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SynchronizedLyrics from './SynchronizedLyrics';
import DownloadButton from './DownloadButton';
import Equalizer from './Equalizer';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTime } from '@/utils/formatTime';
import { attachSource, detachSource } from '@/utils/audioSource';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const Player = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    currentTrack,
    isPlaying,
    volume,
    progress,
    duration,
    shuffle,
    repeat,
    queue,
    lyrics,
    showLyrics,
    crossfadeDuration,
    replayGainEnabled,
    playbackRate,
    useHls,
    restartTick,
    togglePlay,
    next,
    prev,
    setVolume,
    seek,
    toggleShuffle,
    toggleRepeat,
    toggleLyrics,
    setCrossfadeDuration,
    toggleReplayGain,
    setPlaybackRate,
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  // Track loaded in nextAudioRef, handed to the store when the crossfade starts.
  const nextTrackRef = useRef<Track | null>(null);
  // Set when a crossfade already started the new track, so the store update
  // that follows doesn't reload it from the beginning.
  const handedOverTrackIdRef = useRef<string | null>(null);
  const crossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isLiked, setIsLiked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const getNextTrack = useCallback(() => {
    const { queue, shuffle: sh } = usePlayerStore.getState();
    if (queue.length === 0) return null;
    return sh ? queue[Math.floor(Math.random() * queue.length)] : queue[0];
  }, []);

  const startCrossfadeTransition = useCallback((fadeSeconds: number) => {
    const oldAudio = audioRef.current;
    const newAudio = nextAudioRef.current;
    const newTrack = nextTrackRef.current;
    if (crossfadingRef.current || !oldAudio || !newAudio || !newTrack) return;
    crossfadingRef.current = true;

    const store = usePlayerStore.getState();
    newAudio.volume = 0;
    newAudio.playbackRate = store.playbackRate;
    newAudio.play().catch(() => {});

    // Hand over right away: the incoming track drives the UI and the events,
    // the outgoing one only fades out.
    audioRef.current = newAudio;
    nextAudioRef.current = null;
    nextTrackRef.current = null;
    handedOverTrackIdRef.current = newTrack.id;
    store.setDuration(newAudio.duration || 0);
    store.next(newTrack);

    const fadeSteps = 20;
    let step = 0;
    crossfadeTimerRef.current = setInterval(() => {
      step++;
      const progress = step / fadeSteps;
      const target = usePlayerStore.getState().volume;
      oldAudio.volume = Math.max(0, (1 - progress) * target);
      newAudio.volume = Math.min(1, progress * target);

      if (step >= fadeSteps) {
        if (crossfadeTimerRef.current) {
          clearInterval(crossfadeTimerRef.current);
          crossfadeTimerRef.current = null;
        }
        oldAudio.pause();
        detachSource(oldAudio);
        oldAudio.src = '';
        crossfadingRef.current = false;
      }
    }, (fadeSeconds * 1000) / fadeSteps);
  }, []);

  // Listeners are attached once per element and ignore every element but the
  // current one: the Player swaps elements on each crossfade.
  const createAudio = useCallback(() => {
    const audio = new Audio();

    audio.addEventListener('timeupdate', () => {
      if (audio !== audioRef.current) return;
      const store = usePlayerStore.getState();
      if (audio.currentTime) {
        store.seek(audio.currentTime);
      }
      const remaining = audio.duration - audio.currentTime;
      if (
        store.crossfadeDuration > 0 &&
        store.repeat !== 'one' &&
        Number.isFinite(remaining) &&
        remaining <= store.crossfadeDuration
      ) {
        startCrossfadeTransition(Math.max(remaining, 0.5));
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      if (audio !== audioRef.current) return;
      if (audio.duration) {
        usePlayerStore.getState().setDuration(audio.duration);
      }
    });

    audio.addEventListener('ended', () => {
      if (audio !== audioRef.current) return;
      const store = usePlayerStore.getState();
      if (store.repeat === 'one' || (store.repeat === 'all' && store.queue.length === 0)) {
        store.restartCurrent();
        return;
      }
      store.next();
    });

    return audio;
  }, [startCrossfadeTransition]);

  const preloadNextTrack = useCallback(() => {
    const nextTrack = getNextTrack();
    if (!nextTrack) {
      if (nextAudioRef.current) {
        nextAudioRef.current.pause();
        detachSource(nextAudioRef.current);
        nextAudioRef.current.src = '';
        nextAudioRef.current = null;
      }
      nextTrackRef.current = null;
      return;
    }
    if (nextAudioRef.current && nextTrackRef.current?.id === nextTrack.id) return;
    if (!nextAudioRef.current) {
      nextAudioRef.current = createAudio();
      nextAudioRef.current.preload = 'auto';
    }
    attachSource(nextAudioRef.current, nextTrack, usePlayerStore.getState().useHls);
    nextTrackRef.current = nextTrack;
  }, [getNextTrack, createAudio]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = createAudio();
      audioRef.current.volume = volume;
    }
  }, [createAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && currentTrack) {
      if (handedOverTrackIdRef.current === currentTrack.id) {
        // Already playing: the crossfade started it.
        handedOverTrackIdRef.current = null;
      } else {
        attachSource(audio, currentTrack, useHls);
        if (isPlaying) {
          audio.play().catch(() => {});
        }
      }
      checkFavorite('track', String(currentTrack.id))
        .then((res) => setIsLiked(res))
        .catch(() => setIsLiked(false));
    }
    preloadNextTrack();
  }, [currentTrack, useHls]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (restartTick === 0 || !audioRef.current) return;
    const audio = audioRef.current;
    audio.currentTime = 0;
    if (usePlayerStore.getState().isPlaying) {
      audio.play().catch(() => {});
    }
  }, [restartTick]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    preloadNextTrack();
  }, [shuffle, repeat, queue]);

  useEffect(() => {
    return () => {
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
      }
      if (audioRef.current) {
        detachSource(audioRef.current);
      }
      if (nextAudioRef.current) {
        nextAudioRef.current.pause();
        detachSource(nextAudioRef.current);
        nextAudioRef.current = null;
      }
    };
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    seek(time);
  };

  const handleVolumeToggle = () => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  if (!currentTrack) {
    return (
      <div className="flex h-20 items-center justify-center bg-gray-900 border-t border-gray-800">
        <p className="text-sm text-gray-500">{t('player.select_track')}</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {showLyrics && lyrics.length > 0 && (
        <div className="h-64 border-t border-gray-800 bg-gray-900">
          <SynchronizedLyrics lyrics={lyrics} currentTime={progress} onSeek={seek} />
        </div>
      )}
      <div className="flex h-20 items-center justify-between bg-gray-900 px-4 border-t border-gray-800">
      <div className="flex w-1/4 items-center gap-3">
        <Link to={`/track/${currentTrack.id}`}>
          <img
            src={currentTrack.cover_url || '/placeholder-album.svg'}
            alt={currentTrack.title}
            className="h-14 w-14 rounded object-cover"
          />
        </Link>
        <div className="min-w-0">
          <Link
            to={`/track/${currentTrack.id}`}
            className="block truncate text-sm font-medium text-white hover:underline"
          >
            {currentTrack.title}
          </Link>
          <Link
            to={`/artist/${currentTrack.artist?.id || currentTrack.artist_id}`}
            className="block truncate text-xs text-gray-400 hover:underline"
          >
            {currentTrack.artist?.name || t('player.unknown_artist')}
          </Link>
        </div>
        <button
          onClick={async () => {
            if (!currentTrack) return;
            try {
              if (isLiked) {
                await removeFavorite('track', String(currentTrack.id));
                setIsLiked(false);
              } else {
                await addFavorite('track', String(currentTrack.id));
                setIsLiked(true);
              }
            } catch {
              // silently fail
            }
          }}
          className={`ml-2 ${isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
          aria-label={isLiked ? 'Remove from liked' : 'Add to liked'}
        >
          <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex w-2/4 flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={`p-1 ${shuffle ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            aria-label={t('player.shuffle')}
            aria-pressed={shuffle}
          >
            <Shuffle size={16} />
          </button>
          <button onClick={prev} className="p-1 text-gray-400 hover:text-white" aria-label={t('player.previous')}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:scale-105"
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <button onClick={() => next()} className="p-1 text-gray-400 hover:text-white" aria-label={t('player.next')}>
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            onClick={toggleRepeat}
            className={`p-1 ${repeat !== 'off' ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            aria-label={repeat === 'one' ? t('player.repeat_one') : t('player.repeat')}
            aria-pressed={repeat !== 'off'}
          >
            <RepeatIcon size={16} />
          </button>
        </div>

        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-xs text-gray-400">{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={handleSeek}
            role="slider"
            aria-label={t('player.now_playing')}
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={progress}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 focus-visible:outline-2 focus-visible:outline-green-500"
          />
          <span className="w-10 text-xs text-gray-400">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex w-1/4 items-center justify-end gap-2">
        {playbackRate !== 1 && (
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
            {playbackRate}x
          </span>
        )}
        <button
          onClick={toggleLyrics}
          className={`p-1 ${showLyrics ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
          aria-label={t('player.lyrics')}
          aria-pressed={showLyrics}
        >
          <Mic2 size={20} />
        </button>
        <DownloadButton trackId={currentTrack.id} />
        <button
          onClick={() => setShowEqualizer(true)}
          className="p-1 text-gray-400 hover:text-white"
          aria-label={t('player.equalizer')}
        >
          <Sliders size={20} />
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1 ${showSettings ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
          aria-label={t('player.audio_settings')}
          aria-expanded={showSettings}
        >
          <Settings2 size={20} />
        </button>
        <button
          onClick={() => navigate('/jam')}
          className="p-1 text-gray-400 hover:text-white"
          aria-label={t('player.jam_session')}
        >
          <Radio size={20} />
        </button>
        <button onClick={handleVolumeToggle} className="p-1 text-gray-400 hover:text-white" aria-label={isMuted || volume === 0 ? t('player.unmute') : t('player.mute')}>
          {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          role="slider"
          aria-label={t('player.volume')}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={volume}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 focus-visible:outline-2 focus-visible:outline-green-500"
        />
      </div>
      </div>

      {showSettings && (
        <div className="absolute bottom-full right-4 mb-2 w-80 rounded-lg bg-gray-800 p-4 shadow-xl" role="dialog" aria-label={t('player.audio_settings')}>
          <h3 className="mb-3 text-sm font-medium text-white">{t('player.audio_settings')}</h3>

          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-gray-400">{t('player.crossfade')}</label>
              <span className="text-xs text-gray-500">{crossfadeDuration}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={crossfadeDuration}
              onChange={(e) => setCrossfadeDuration(parseInt(e.target.value))}
              aria-label={t('player.crossfade')}
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={crossfadeDuration}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 focus-visible:outline-2 focus-visible:outline-green-500"
            />
          </div>

          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-gray-400 flex items-center gap-1">
                <Gauge size={12} /> {t('player.playback_speed')}
              </label>
              <span className="text-xs text-gray-500">{playbackRate}x</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                    playbackRate === rate
                      ? 'bg-green-500 text-black'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">{t('player.replay_gain')}</label>
            <button
              onClick={toggleReplayGain}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                replayGainEnabled ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'
              }`}
              aria-pressed={replayGainEnabled}
            >
              {replayGainEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      <Equalizer isOpen={showEqualizer} onClose={() => setShowEqualizer(false)} audioRef={audioRef} />
    </div>
  );
};

export default Player;
