import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { recheckCovers } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

/** Re-fetch covers wrongly shared between tracks of one artist (background job). */
const RecheckCoversButton = () => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    recheckCovers(true)
      .then(({ count, running }) => {
        setCount(count);
        setRunning(running);
      })
      .catch(() => setCount(null));
  }, []);

  const start = async () => {
    if (!count || !confirm(t('admin.covers_confirm', { count }))) return;
    try {
      await recheckCovers(false);
      setRunning(true);
      addToast(t('admin.covers_started', { count }));
    } catch (err: any) {
      addToast(err?.response?.data?.detail || t('admin.covers_error'));
    }
  };

  if (running) {
    return <span className="flex min-h-11 items-center px-2 text-sm text-gray-400">{t('admin.covers_running')}</span>;
  }
  if (!count) return null;
  return (
    <button
      onClick={start}
      className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 pointer-coarse:min-h-11"
      title={t('admin.covers_hint')}
    >
      <ImageOff size={16} aria-hidden="true" />
      {t('admin.covers_button', { count })}
    </button>
  );
};

export default RecheckCoversButton;
