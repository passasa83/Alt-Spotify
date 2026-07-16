import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { SearchFilters } from '@/types';

const MUSICAL_KEYS = [
  'C', 'Cm', 'C#', 'C#m',
  'D', 'Dm', 'D#', 'D#m',
  'E', 'Em',
  'F', 'Fm', 'F#', 'F#m',
  'G', 'Gm', 'G#', 'G#m',
  'A', 'Am', 'A#', 'A#m',
  'B', 'Bm',
];

const MOODS = [
  'energetic', 'calm', 'sad', 'happy', 'angry',
  'romantic', 'chill', 'dark', 'uplifting', 'melancholic',
  'party', 'focus', 'sleep', 'workout', 'motivational',
];

const GENRES = [
  'Pop', 'Hip-Hop', 'Rock', 'R&B', 'Jazz', 'Classical', 'Electronic',
  'Country', 'Metal', 'Folk', 'Latin', 'Indie', 'Punk', 'Reggae',
];

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

const SearchFiltersPanel = ({ filters, onChange }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;

  const update = (patch: Partial<SearchFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const clear = () => {
    onChange({});
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-white hover:text-white"
      >
        <SlidersHorizontal size={16} />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-green-500 px-2 py-0.5 text-xs font-bold text-black">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Advanced Filters</h3>
            {activeCount > 0 && (
              <button onClick={clear} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                <X size={12} /> Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Genre</label>
              <select
                value={filters.genre || ''}
                onChange={(e) => update({ genre: e.target.value || undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
              >
                <option value="">All genres</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">BPM Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={300}
                  placeholder="Min"
                  value={filters.min_bpm || ''}
                  onChange={(e) => update({ min_bpm: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  placeholder="Max"
                  value={filters.max_bpm || ''}
                  onChange={(e) => update({ max_bpm: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Key</label>
              <select
                value={filters.key || ''}
                onChange={(e) => update({ key: e.target.value || undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
              >
                <option value="">All keys</option>
                {MUSICAL_KEYS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Mood</label>
              <select
                value={filters.mood || ''}
                onChange={(e) => update({ mood: e.target.value || undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
              >
                <option value="">All moods</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Duration (seconds)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={filters.min_duration || ''}
                  onChange={(e) => update({ min_duration: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  value={filters.max_duration || ''}
                  onChange={(e) => update({ max_duration: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Year</label>
              <input
                type="number"
                min={1900}
                max={2100}
                placeholder="e.g. 2024"
                value={filters.year || ''}
                onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-gray-400">Search in lyrics</label>
              <input
                type="text"
                placeholder="e.g. tonight, forever, heart..."
                value={filters.lyrics || ''}
                onChange={(e) => update({ lyrics: e.target.value || undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchFiltersPanel;
