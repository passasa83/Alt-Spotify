import { usePlayerStore, type RepeatMode } from '@/stores/playerStore';
import { getTrackStreamUrl } from '@/api/tracks';
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
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SynchronizedLyrics from './SynchronizedLyrics';
import DownloadButton from './DownloadButton';
import Equalizer from './Equalizer';
import { useCrossfade } from '@/hooks/useCrossfade';
import { useTranslation } from '@/hooks/useTranslation';

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
    lyrics,
    showLyrics,
    crossfadeDuration,
    replayGainEnabled,
    togglePlay,
    next,
    prev,
    setVolume,
    seek,
    setDuration,
    toggleShuffle,
    toggleRepeat,
    toggleLyrics,
    setCrossfadeDuration,
    toggleReplayGain,
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isLiked, setIsLiked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const { startCrossfade } = useCrossfade(audioRef);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      if (audio.currentTime) {
        seek(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (crossfadeDuration > 0) {
        startCrossfade();
      } else {
        next();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [crossfadeDuration]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = getTrackStreamUrl(currentTrack.id);
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [currentTrack]);

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
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            src={currentTrack.cover_url || '/placeholder-album.png'}
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
            to={`/artist/${currentTrack.artist_id}`}
            className="block truncate text-xs text-gray-400 hover:underline"
          >
            {currentTrack.artist?.name || t('player.unknown_artist')}
          </Link>
        </div>
        <button
          onClick={() => setIsLiked(!isLiked)}
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
          <button onClick={next} className="p-1 text-gray-400 hover:text-white" aria-label={t('player.next')}>
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
        <div className="absolute bottom-full right-4 mb-2 w-72 rounded-lg bg-gray-800 p-4 shadow-xl" role="dialog" aria-label={t('player.audio_settings')}>
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

      <Equalizer isOpen={showEqualizer} onClose={() => setShowEqualizer(false)} />
    </div>
  );
};

export default Player;
