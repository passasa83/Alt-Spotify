import { useEffect, useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import client from '@/api/client';
import type { ArtistImport } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const POLL_MS = 10_000;

/** Progress of the discography download a search started (artist_import). */
const ArtistImportBanner = ({ initial }: { initial: ArtistImport }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ArtistImport>(initial);

  useEffect(() => setStatus(initial), [initial]);

  const active = status.state === 'preparing' || status.state === 'downloading';
  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const { data } = await client.get(`/search/artist-import/${status.deezer_id}`);
        setStatus(data);
      } catch {
        // Keep the last known state.
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, status.deezer_id]);

  const { artist, done = 0, failed = 0, total = 0, already = 0 } = status;
  let icon = <Loader2 size={18} className="animate-spin text-green-400" aria-hidden="true" />;
  let text = t('import.preparing', { artist });
  let tone = 'bg-green-500/10 ring-green-500/30';
  if (status.state === 'downloading') {
    icon = <Download size={18} className="text-green-400" aria-hidden="true" />;
    text = t('import.downloading', { artist, done: done + failed, total });
  } else if (status.state === 'finished') {
    icon = <CheckCircle2 size={18} className="text-green-400" aria-hidden="true" />;
    text = t('import.finished', { artist, count: done, already });
  } else if (status.state === 'quota') {
    icon = <AlertTriangle size={18} className="text-yellow-300" aria-hidden="true" />;
    text = t('import.quota', { limit: status.limit ?? 5 });
    tone = 'bg-yellow-500/10 ring-yellow-500/30';
  }
  const percent = total ? Math.round(((done + failed) / total) * 100) : 0;

  return (
    <div className={`mb-6 rounded-lg p-4 ring-1 ${tone}`} role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-white">
        {icon}
        {text}
      </p>
      {status.state === 'downloading' && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-700" aria-hidden="true">
            <div className="h-full bg-green-500 transition-[width] duration-700" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {t('import.hint')}
            {failed > 0 && ` ${t('import.not_found', { count: failed })}`}
          </p>
        </>
      )}
    </div>
  );
};

export default ArtistImportBanner;
