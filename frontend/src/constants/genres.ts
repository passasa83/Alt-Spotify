import { useEffect, useState } from 'react';
import { getGenres, type GenreCount } from '@/api/tracks';
import type { TranslationKey } from '@/i18n/en';

/** Genres stored in tracks.genre (same list as backend/app/services/genre_service.py). */
export const GENRES = [
  'Pop', 'Hip-Hop', 'Rock', 'Alternative', 'Metal', 'Punk', 'Electronic', 'R&B',
  'French Pop', 'Jazz', 'Blues', 'Classical', 'Reggae', 'Latin', 'Country',
  'Folk', 'World', 'K-Pop', 'Soundtrack',
];

const slug = (genre: string) => genre.toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** Translated name of a stored genre (unknown ones are shown as stored). */
export const genreLabel = (genre: string, t: (key: TranslationKey) => string): string => {
  const key = `genre.${slug(genre)}` as TranslationKey;
  const label = t(key);
  return label === key ? genre : label;
};

/** Genres that have playable tracks, most represented first. */
export const useGenres = () => {
  const [genres, setGenres] = useState<GenreCount[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGenres()
      .then((list) => !cancelled && setGenres(list))
      .catch(() => !cancelled && setGenres([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return genres;
};
