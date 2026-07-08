import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  status: 200,
  headers: new Headers(),
});
Object.defineProperty(globalThis, 'fetch', { value: fetchMock });

afterEach(() => {
  localStorageMock.clear();
  fetchMock.mockClear();
  vi.restoreAllMocks();
});
