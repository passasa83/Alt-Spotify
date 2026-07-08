import { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, FileText } from 'lucide-react';
import client from '@/api/client';

interface ImportResult {
  playlist_id: string;
  matched: number;
  unmatched: { row: number; reason: string }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (playlistId: string) => void;
}

const ImportPlaylistModal = ({ isOpen, onClose, onImported }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json') {
      setError('Please select a CSV or JSON file');
      return;
    }

    setFile(selected);
    setError(null);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const ext = file.name.split('.').pop()?.toLowerCase();
      const endpoint = ext === 'csv'
        ? '/playlists/import-export/csv'
        : '/playlists/import-export/json';

      const response = await client.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      if (onImported) {
        onImported(response.data.playlist_id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-lg bg-gray-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Import Playlist</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {!result ? (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-gray-600 p-8 transition-colors hover:border-green-500"
            >
              {file ? (
                <>
                  <FileText size={32} className="mb-2 text-green-500" />
                  <p className="text-sm text-white">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <Upload size={32} className="mb-2 text-gray-400" />
                  <p className="text-sm text-white">
                    Drop a CSV or JSON file here
                  </p>
                  <p className="text-xs text-gray-400">
                    CSV columns: title, artist, album (optional)
                  </p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
              className="hidden"
            />

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded bg-red-500/20 px-3 py-2 text-sm text-red-400">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || isImporting}
              className="mt-4 w-full rounded-full bg-green-500 py-3 font-bold text-black transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : 'Import Playlist'}
            </button>
          </>
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-green-500/10 p-4">
              <Check size={24} className="text-green-500" />
              <div>
                <p className="font-medium text-white">
                  {result.matched} track{result.matched !== 1 ? 's' : ''} matched
                </p>
                {result.unmatched.length > 0 && (
                  <p className="text-sm text-gray-400">
                    {result.unmatched.length} track{result.unmatched.length !== 1 ? 's' : ''} unmatched
                  </p>
                )}
              </div>
            </div>

            {result.unmatched.length > 0 && (
              <div className="mb-4 max-h-40 overflow-y-auto rounded bg-gray-800 p-3">
                <p className="mb-2 text-xs font-medium text-gray-400">Unmatched tracks:</p>
                {result.unmatched.map((item, idx) => (
                  <p key={idx} className="text-xs text-gray-500">
                    Row {item.row}: {item.reason}
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full rounded-full bg-white py-3 font-bold text-black hover:scale-105"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportPlaylistModal;
