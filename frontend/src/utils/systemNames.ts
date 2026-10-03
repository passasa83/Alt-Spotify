import type { TranslationKey } from '@/i18n/en';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Server-side title of the favorites playlist; also how it is recognised. */
export const LIKED_SONGS_TITLE = 'Liked Songs';
const LIKED_SONGS_DESCRIPTION = 'Your liked songs';

/** Names the server generates in English, shown in the user's language. */
export const playlistTitle = (title: string, t: Translate): string =>
  title === LIKED_SONGS_TITLE ? t('nav.liked_songs') : title;

export const playlistDescription = (description: string, t: Translate): string =>
  description === LIKED_SONGS_DESCRIPTION ? t('library.liked_songs_desc') : description;

export const mixTitle = (title: string, t: Translate): string => {
  const match = /^Daily Mix (\d+)$/.exec(title);
  return match ? t('discover.daily_mix', { number: match[1]! }) : title;
};
