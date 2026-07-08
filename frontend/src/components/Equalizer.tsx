import { useEqualizerStore, BAND_FREQUENCIES } from '@/stores/equalizerStore';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_NAMES = [
  { id: 'flat', label: 'Flat' },
  { id: 'bass-boost', label: 'Bass Boost' },
  { id: 'treble-boost', label: 'Treble Boost' },
  { id: 'vocal', label: 'Vocal' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'rock', label: 'Rock' },
];

const Equalizer = ({ isOpen, onClose }: Props) => {
  const { bands, preset, isEnabled, setBand, setPreset, toggle } = useEqualizerStore();

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
