import { useEffect, useState } from 'react';
import { Tags } from 'lucide-react';
import { fillGenres } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

/** Give a genre to tracks that have none, looked up per artist (background job). */
const FillGenresButton = () => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [missing, setMissing] = useState<{ artists: number; tracks: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fillGenres(true)
      .then(({ artists, tracks, running }) => {
        setMissing({ artists, tracks });
        setRunning(running);
      })
      .catch(() => setMissing(null));
  }, []);

  const start = async () => {
    if (!missing?.tracks) return;
    try {
      await fillGenres(false);
      setRunning(true);
      addToast(t('admin.genres_started', { count: missing.artists }));
    } catch (err: any) {
      addToast(err?.response?.data?.detail || t('admin.genres_error'));
    }
  };

  if (running) {
    return <span className="flex min-h-11 items-center px-2 text-sm text-gray-400">{t('admin.genres_running')}</span>;
  }
  if (!missing?.tracks) return null;
  return (
    <button
      onClick={start}
      className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 pointer-coarse:min-h-11"
      title={t('admin.genres_hint')}
    >
      <Tags size={16} aria-hidden="true" />
      {t('admin.genres_button', { count: missing.tracks })}
    </button>
  );
};

export default FillGenresButton;
