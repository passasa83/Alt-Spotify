import { useEffect, useRef, useCallback } from 'react';
import { useEqualizerStore, BAND_FREQUENCIES } from '@/stores/equalizerStore';
import { usePlayerStore } from '@/stores/playerStore';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PRESET_NAMES = [
  { id: 'flat', label: 'Flat' },
  { id: 'bass-boost', label: 'Bass Boost' },
  { id: 'treble-boost', label: 'Treble Boost' },
  { id: 'vocal', label: 'Vocal' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'rock', label: 'Rock' },
];

const Equalizer = ({ isOpen, onClose, audioRef }: Props) => {
  const { bands, preset, isEnabled, setBand, setPreset, toggle } = useEqualizerStore();
  const { replayGainEnabled, currentTrack } = usePlayerStore();

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const outputRef = useRef<GainNode | null>(null);

  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const source = ctx.createMediaElementSource(audioRef.current!);
    sourceRef.current = source;

    const output = ctx.createGain();
    outputRef.current = output;

    let lastNode: AudioNode = source;

    BAND_FREQUENCIES.forEach((freq, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? 'lowshelf' : i === BAND_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = bands[i] || 0;
      filtersRef.current[i] = filter;
      lastNode.connect(filter);
      lastNode = filter;
    });

    const gainNode = ctx.createGain();
    gainNodeRef.current = gainNode;
    lastNode.connect(gainNode);
    gainNode.connect(output);
    output.connect(ctx.destination);

    return ctx;
  }, [audioRef, bands]);

  useEffect(() => {
    if (!audioRef.current || !isEnabled || !isOpen) return;

    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = initAudioContext();
    }

    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }, [isEnabled, isOpen, audioRef, initAudioContext]);

  useEffect(() => {
    if (!isEnabled || !audioContextRef.current) {
      filtersRef.current.forEach((filter) => {
        if (filter) filter.gain.value = 0;
      });
      return;
    }
    bands.forEach((value, i) => {
      if (filtersRef.current[i]) {
        filtersRef.current[i].gain.value = value;
      }
    });
  }, [bands, isEnabled]);

  useEffect(() => {
    if (!gainNodeRef.current || !audioRef.current) return;

    if (replayGainEnabled && currentTrack?.track_gain != null) {
      const gainDb = currentTrack.track_gain;
      const gainLinear = Math.pow(10, gainDb / 20);
      gainNodeRef.current.gain.value = Math.min(gainLinear, 3);
    } else {
      gainNodeRef.current.gain.value = 1;
    }
  }, [replayGainEnabled, currentTrack]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
        sourceRef.current = null;
        filtersRef.current = [];
        gainNodeRef.current = null;
        outputRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const formatFreq = (freq: number) => {
    if (freq >= 1000) return `${freq / 1000}k`;
    return `${freq}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-lg bg-gray-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Equalizer</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isEnabled ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'
              }`}
            >
              {isEnabled ? 'ON' : 'OFF'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESET_NAMES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                preset === p.id
                  ? 'bg-white text-black'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-end justify-between gap-1 py-4">
          {bands.map((value, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">
                {value > 0 ? `+${value}` : value}
              </span>
              <div className="relative h-40 w-4">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={value}
                  onChange={(e) => setBand(index, parseInt(e.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                  }}
                  disabled={!isEnabled}
                />
                <div className="pointer-events-none absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-gray-700">
                  <div
                    className="absolute bottom-1/2 left-0 w-full rounded-full bg-green-500"
                    style={{
                      height: `${Math.max(0, (value / 12) * 50)}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 left-0 w-full rounded-full bg-green-500"
                    style={{
                      height: `${Math.max(0, (-value / 12) * 50)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-gray-400">{formatFreq(BAND_FREQUENCIES[index])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Equalizer;
