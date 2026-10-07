import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { redownloadMissing } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

/** Fetch the audio again of every track whose file disappeared (background job). */
const RedownloadMissingButton = () => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    redownloadMissing(true)
      .then(({ count, running }) => {
        setCount(count);
        setRunning(running);
      })
      .catch(() => setCount(null));
  }, []);

  const start = async () => {
    if (!count || !confirm(t('admin.redownload_confirm', { count }))) return;
    try {
      await redownloadMissing(false);
      setRunning(true);
      addToast(t('admin.redownload_started', { count }));
    } catch (err: any) {
      addToast(err?.response?.data?.detail || t('admin.redownload_error'));
    }
  };

  if (running) {
    return <span className="flex min-h-11 items-center px-2 text-sm text-gray-400">{t('admin.redownload_running')}</span>;
  }
  if (!count) return null;
  return (
    <button
      onClick={start}
      className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 pointer-coarse:min-h-11"
      title={t('admin.redownload_hint')}
    >
      <Download size={16} aria-hidden="true" />
      {t('admin.redownload_button', { count })}
    </button>
  );
};

export default RedownloadMissingButton;
