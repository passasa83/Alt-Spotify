import { usePlayerStore, type RepeatMode } from '@/stores/playerStore';
import type { Track } from '@/types';
import { resolveCoverUrl, getTrackStreamUrl } from '@/api/tracks';
import { getMe } from '@/api/users';
import { useToastStore } from '@/stores/toastStore';
import { t as translate } from '@/i18n';
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
  ListMusic,
  Check,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SynchronizedLyrics from './SynchronizedLyrics';
import { useTrackDownload } from './DownloadButton';
import OverflowToolbar, { type ToolbarItem } from './OverflowToolbar';
import { usePopover } from '@/hooks/usePopover';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import Equalizer from './Equalizer';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTime } from '@/utils/formatTime';
import { attachSource, detachSource } from '@/utils/audioSource';
import { useMediaSession } from '@/hooks/useMediaSession';
import QueuePanel from './QueuePanel';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Unplayable tracks skipped in a row before giving up.
const MAX_CONSECUTIVE_ERRORS = 3;

// A play() blocked by the browser's autoplay policy must not leave the UI on
// "playing"; an AbortError (source changed mid-load) is expected and harmless.
const safePlay = (audio: HTMLAudioElement) => {
  audio.play().catch((err: unknown) => {
    if ((err as DOMException)?.name === 'NotAllowedError') {
      usePlayerStore.getState().pause();
    }
  });
};

// <audio> doesn't expose the HTTP status: ask the stream endpoint directly.
const probeStreamStatus = async (trackId: string): Promise<number> => {
  const controller = new AbortController();
  try {
    const response = await fetch(getTrackStreamUrl(trackId), {
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return 0;
  } finally {
    controller.abort();
  }
};

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
  const consecutiveErrorsRef = useRef(0);
  const authRetriedTrackIdRef = useRef<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isLiked, setIsLiked] = useState(false);
  // Panels share the global "one open at a time" store: they never overlap
  // each other, nor the top bar menus.
  const queuePanelRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const queuePanel = usePopover('player-queue', [queuePanelRef]);
  const settingsPanel = usePopover('player-settings', [settingsPanelRef]);
  const equalizerPanel = usePopover('player-equalizer');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const download = useTrackDownload(currentTrack?.id ?? '');

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
    safePlay(newAudio);

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

  // Tell the user, then move on: a 401 gets one retry after a token refresh,
  // anything else skips to the next track (up to MAX_CONSECUTIVE_ERRORS).
  const handlePlaybackError = useCallback(async (audio: HTMLAudioElement) => {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    const status = await probeStreamStatus(track.id);
    const store = usePlayerStore.getState();
    if (audio !== audioRef.current || store.currentTrack?.id !== track.id) return;

    if (status === 401 && authRetriedTrackIdRef.current !== track.id) {
      authRetriedTrackIdRef.current = track.id;
      try {
        await getMe(); // the API client refreshes the access token on 401
      } catch {
        return; // refresh failed: the client redirects to /login
      }
      attachSource(audio, track, store.useHls);
      if (store.isPlaying) safePlay(audio);
      return;
    }

    const { addToast } = useToastStore.getState();
    addToast(translate(status === 404 ? 'player.error_not_found' : 'player.error_playback', { title: track.title }));
    consecutiveErrorsRef.current += 1;
    if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
      consecutiveErrorsRef.current = 0;
      store.pause();
      addToast(translate('player.error_stopped'));
      return;
    }
    if (store.queue.length > 0 || store.repeat === 'off') {
      store.next();
    } else {
      store.pause();
    }
  }, []);

  // Listeners are attached once per element and ignore every element but the
  // current one: the Player swaps elements on each crossfade.
  const createAudio = useCallback(() => {
    const audio = new Audio();

    audio.addEventListener('error', () => {
      if (audio !== audioRef.current) return;
      // Clearing the source (src = '') and aborted loads are not failures.
      if (!audio.error || audio.error.code === 1 /* MEDIA_ERR_ABORTED */) return;
      if (!audio.getAttribute('src')) return;
      void handlePlaybackError(audio);
    });

    audio.addEventListener('playing', () => {
      if (audio !== audioRef.current) return;
      consecutiveErrorsRef.current = 0;
    });

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
      if (store.repeat === 'one') {
        store.restartCurrent();
        return;
      }
      // Gapless: the next track is already buffered in its own element.
      if (nextAudioRef.current && nextTrackRef.current) {
        startCrossfadeTransition(0.05);
        return;
      }
      store.next();
    });

    return audio;
  }, [startCrossfadeTransition, handlePlaybackError]);

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
          safePlay(audio);
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
        safePlay(audioRef.current);
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
      safePlay(audio);
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

  useMediaSession(audioRef);

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;
  const progressPercent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  const muted = isMuted || volume === 0;
  const toolbarItems: ToolbarItem[] = [
    { key: 'queue', label: t('player.queue'), icon: ListMusic, onClick: queuePanel.toggle, active: queuePanel.isOpen, popover: 'player-queue' },
    { key: 'lyrics', label: t('player.lyrics'), icon: Mic2, onClick: toggleLyrics, active: showLyrics },
    {
      key: 'download',
      label: download.downloaded ? t('player.remove_download') : t('player.download'),
      icon: download.downloaded ? Check : Download,
      onClick: download.toggle,
      active: download.downloaded,
      disabled: download.isDownloading,
    },
    { key: 'equalizer', label: t('player.equalizer'), icon: Sliders, onClick: equalizerPanel.open },
    {
      key: 'settings',
      label: t('player.audio_settings'),
      icon: Settings2,
      onClick: settingsPanel.toggle,
      active: settingsPanel.isOpen,
      hint: playbackRate !== 1 ? `${playbackRate}x` : undefined,
      popover: 'player-settings',
    },
    { key: 'jam', label: t('player.jam_session'), icon: Radio, onClick: () => navigate('/jam') },
    // Shown inline in the centre / next to the slider on wider screens.
    ...(isDesktop
      ? []
      : [
          { key: 'shuffle', label: t('player.shuffle'), icon: Shuffle, onClick: toggleShuffle, active: shuffle },
          {
            key: 'repeat',
            label: repeat === 'one' ? t('player.repeat_one') : t('player.repeat'),
            icon: RepeatIcon,
            onClick: toggleRepeat,
            active: repeat !== 'off',
          },
          { key: 'mute', label: muted ? t('player.unmute') : t('player.mute'), icon: muted ? VolumeX : Volume2, onClick: handleVolumeToggle, active: muted },
        ]),
  ];

  if (!currentTrack) {
    return (
      <div className="hidden h-20 flex-shrink-0 items-center justify-center bg-gray-900 border-t border-gray-800 md:flex">
        <p className="text-sm text-gray-500">{t('player.select_track')}</p>
      </div>
    );
  }

  return (
    <div className="relative z-50 flex-shrink-0">
      {showLyrics && lyrics.length > 0 && (
        <div className="h-64 border-t border-gray-800 bg-gray-900">
          <SynchronizedLyrics lyrics={lyrics} currentTime={progress} onSeek={seek} />
        </div>
      )}
      <div className="relative flex h-16 items-center justify-between gap-2 bg-gray-900 px-3 border-t border-gray-800 md:h-20 md:px-4">
      {/* Mobile: thin seek bar along the top edge */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={progress}
        onChange={handleSeek}
        aria-label={t('player.now_playing')}
        className="absolute inset-x-0 -top-1 h-2 w-full cursor-pointer appearance-none bg-transparent accent-green-500 md:hidden"
        style={{ background: `linear-gradient(to right, rgb(34 197 94) ${progressPercent}%, rgb(55 65 81) ${progressPercent}%) center / 100% 2px no-repeat` }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-3 md:w-1/4 md:flex-none lg:w-1/4">
        <Link to={`/track/${currentTrack.id}`}>
          <img
            src={resolveCoverUrl(currentTrack.cover_url || currentTrack.album?.cover_url)}
            alt={currentTrack.title}
            className="h-11 w-11 rounded object-cover md:h-14 md:w-14"
          />
        </Link>
        <div className="min-w-0">
          <Link
            to={`/track/${currentTrack.id}`}
            className="block truncate text-sm font-bold text-white hover:underline"
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

      <div className="flex flex-shrink-0 flex-col items-center gap-1 md:w-2/5 lg:w-2/4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={`hidden p-1 md:block ${shuffle ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
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
            className={`hidden p-1 md:block ${repeat !== 'off' ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            aria-label={repeat === 'one' ? t('player.repeat_one') : t('player.repeat')}
            aria-pressed={repeat !== 'off'}
          >
            <RepeatIcon size={16} />
          </button>
        </div>

        <div className="hidden w-full items-center gap-2 md:flex">
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

      <OverflowToolbar
        items={toolbarItems}
        moreLabel={t('player.more')}
        placement="top"
        className="min-w-[2.5rem] flex-1 md:w-1/3 md:flex-none lg:w-1/4"
        trailing={
          isDesktop ? (
            <>
              <button
                onClick={handleVolumeToggle}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={muted ? t('player.unmute') : t('player.mute')}
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label={t('player.volume')}
                className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 focus-visible:outline-2 focus-visible:outline-green-500 xl:w-24"
              />
            </>
          ) : undefined
        }
      />
      </div>

      {queuePanel.isOpen && (
        <div ref={queuePanelRef}>
          <QueuePanel onClose={queuePanel.close} />
        </div>
      )}

      {settingsPanel.isOpen && (
        <div ref={settingsPanelRef} className="absolute bottom-full right-0 mb-2 max-h-[70vh] w-full overflow-y-auto rounded-lg bg-gray-800 p-4 shadow-xl sm:right-4 sm:w-80" role="dialog" aria-label={t('player.audio_settings')}>
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

          <p className="mb-3 text-[11px] leading-snug text-gray-500">{t('player.shortcuts')}</p>

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

      <Equalizer isOpen={equalizerPanel.isOpen} onClose={equalizerPanel.close} audioRef={audioRef} />
    </div>
  );
};

export default Player;
