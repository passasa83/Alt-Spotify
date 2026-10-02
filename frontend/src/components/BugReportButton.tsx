import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Bug, X } from 'lucide-react';
import { sendBugReport, type BugCategory } from '@/api/bugReports';
import { usePlayerStore } from '@/stores/playerStore';
import { useToastStore } from '@/stores/toastStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n/en';
import { recentErrors } from '@/utils/diagnostics';

const CATEGORIES: BugCategory[] = ['playback', 'display', 'account', 'other'];

/** What a report carries besides the user's own words. */
export const collectContext = () => {
  const { currentTrack, isPlaying, progress, useHls } = usePlayerStore.getState();
  return {
    app_version: import.meta.env.VITE_APP_VERSION || 'dev',
    screen: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    online: navigator.onLine,
    track: currentTrack
      ? {
          id: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist?.name ?? null,
          hls: !!currentTrack.hls_path,
          is_playing: isPlaying,
          position: Math.round(progress),
          prefer_hls: useHls,
        }
      : null,
    errors: recentErrors(),
  };
};

/** Top bar button: lets testers report a problem without leaving the app. */
const BugReportButton = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const addToast = useToastStore((s) => s.addToast);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<BugCategory>('playback');
  const [description, setDescription] = useState('');
  const [withDetails, setWithDetails] = useState(true);
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => textRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const canSend = description.trim().length >= 5 && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      await sendBugReport({
        category,
        description: description.trim(),
        page_url: location.pathname,
        context: withDetails ? collectContext() : undefined,
      });
      addToast(t('bug.sent'));
      setDescription('');
      setOpen(false);
    } catch (err: any) {
      addToast(err?.response?.status === 429 ? t('bug.too_many') : t('bug.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('bug.report')}
        title={t('bug.report')}
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-white"
      >
        <Bug size={20} aria-hidden="true" />
      </button>

      {/* Portal: the top bar's backdrop-blur would trap a fixed overlay inside it. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-gray-900 p-5 shadow-2xl sm:rounded-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="bug-report-title" className="flex items-center gap-2 text-lg font-bold text-white">
                <Bug size={20} className="text-green-500" aria-hidden="true" />
                {t('bug.report')}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('bug.close')}
                className="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium text-gray-300">{t('bug.category')}</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className={`min-h-11 rounded-full px-4 text-sm ${
                      category === c ? 'bg-green-500 font-semibold text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {t(`bug.category.${c}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="bug-description" className="mb-1 block text-sm font-medium text-gray-300">
              {t('bug.description')}
            </label>
            <textarea
              ref={textRef}
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder={t('bug.placeholder')}
              className="w-full resize-y rounded-md bg-gray-800 p-3 text-sm text-white placeholder-gray-500 outline-none focus:outline-2 focus:outline-green-500"
            />

            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={withDetails}
                onChange={(e) => setWithDetails(e.target.checked)}
                className="mt-0.5 h-5 w-5 flex-shrink-0 accent-green-500"
              />
              <span>
                {t('bug.with_details')}
                <span className="block text-xs text-gray-500">{t('bug.with_details_hint')}</span>
              </span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-full px-5 text-sm font-semibold text-gray-300 hover:text-white"
              >
                {t('bug.cancel')}
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="min-h-11 rounded-full bg-green-500 px-6 text-sm font-bold text-black hover:bg-green-400 disabled:opacity-40"
              >
                {sending ? t('bug.sending') : t('bug.send')}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
};

export default BugReportButton;
