import { create } from 'zustand';

const BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'bass-boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'treble-boost': [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  vocal: [0, 0, 0, 2, 4, 4, 3, 1, 0, 0],
  electronic: [4, 3, 1, 0, -2, 0, 2, 3, 4, 3],
  rock: [4, 3, 1, 0, -1, 1, 3, 4, 5, 5],
};

interface EqualizerState {
  bands: number[];
  preset: string;
  isEnabled: boolean;
  setBand: (index: number, value: number) => void;
  setPreset: (preset: string) => void;
  toggle: () => void;
}

export const useEqualizerStore = create<EqualizerState>((set, get) => ({
  bands: [...PRESETS['flat']],
  preset: 'flat',
  isEnabled: false,

  setBand: (index, value) => {
    const bands = [...get().bands];
    bands[index] = Math.max(-12, Math.min(12, value));
    set({ bands, preset: 'custom' });
  },

  setPreset: (preset) => {
    const values = PRESETS[preset];
    if (values) {
      set({ bands: [...values], preset });
    }
  },

  toggle: () => {
    const { isEnabled } = get();
    set({ isEnabled: !isEnabled });
  },
}));

export { BAND_FREQUENCIES, PRESETS };
