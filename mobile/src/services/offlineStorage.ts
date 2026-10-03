import * as FileSystem from 'expo-file-system';

interface DownloadedTrack {
  trackId: string;
  localUri: string;
  downloadedAt: number;
  size: number;
}

const OFFLINE_DIR = `${FileSystem.documentDirectory}offline_tracks/`;
const INDEX_FILE = `${OFFLINE_DIR}index.json`;

async function ensureDir() {
  const dirInfo = await FileSystem.getInfoAsync(OFFLINE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  }
}

async function loadIndex(): Promise<Record<string, DownloadedTrack>> {
  await ensureDir();
  const info = await FileSystem.getInfoAsync(INDEX_FILE);
  if (!info.exists) return {};
  const content = await FileSystem.readAsStringAsync(INDEX_FILE);
  return JSON.parse(content);
}

async function saveIndex(index: Record<string, DownloadedTrack>) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Audio players pick the decoder from the extension.
const EXTENSIONS: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/**
 * Save a track for offline listening, streamed straight to the app's private
 * storage (a 50 MB FLAC must never go through a JS string).
 */
export async function downloadTrack(trackId: string, streamUrl: string): Promise<DownloadedTrack> {
  const index = await loadIndex();
  if (index[trackId]) return index[trackId];
  await ensureDir();

  const partial = `${OFFLINE_DIR}${trackId}.part`;
  const result = await FileSystem.downloadAsync(streamUrl, partial);
  if (result.status !== 200) {
    await FileSystem.deleteAsync(partial, { idempotent: true });
    throw new Error(`Download failed (HTTP ${result.status})`);
  }
  const type = (result.headers['Content-Type'] || result.headers['content-type'] || '').split(';')[0]!.trim();
  const localUri = `${OFFLINE_DIR}${trackId}.${EXTENSIONS[type] ?? 'audio'}`;
  await FileSystem.moveAsync({ from: partial, to: localUri });

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  const track: DownloadedTrack = {
    trackId,
    localUri,
    downloadedAt: Date.now(),
    size: fileInfo.exists ? fileInfo.size : 0,
  };

  index[trackId] = track;
  await saveIndex(index);

  return track;
}

export async function removeDownload(trackId: string): Promise<void> {
  const index = await loadIndex();
  const track = index[trackId];
  if (track) {
    await FileSystem.deleteAsync(track.localUri, { idempotent: true });
    delete index[trackId];
    await saveIndex(index);
  }
}

export async function getDownloadedTracks(): Promise<Record<string, DownloadedTrack>> {
  return loadIndex();
}

export async function isTrackDownloaded(trackId: string): Promise<boolean> {
  const index = await loadIndex();
  return !!index[trackId];
}

export async function getOfflineTrackUri(trackId: string): Promise<string | null> {
  const index = await loadIndex();
  const track = index[trackId];
  return track?.localUri || null;
}
