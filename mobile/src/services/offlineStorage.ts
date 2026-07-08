import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

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

export async function downloadTrack(
  trackId: string,
  streamUrl: string,
  userId: string,
  deviceId: string
): Promise<DownloadedTrack> {
  const index = await loadIndex();
  if (index[trackId]) return index[trackId];

  const response = await fetch(streamUrl);
  const blob = await response.blob();

  const key = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${userId}:${deviceId}`
  );

  const localUri = `${OFFLINE_DIR}${trackId}.enc`;
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const encrypted = new Uint8Array(uint8.length + 16);
  for (let i = 0; i < 16; i++) {
    encrypted[i] = parseInt(key.slice(i * 2, i * 2 + 2), 16);
  }
  encrypted.set(uint8, 16);

  await FileSystem.writeAsStringAsync(
    localUri,
    String.fromCharCode(...encrypted),
    { encoding: FileSystem.EncodingType.Base64 }
  );

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  const track: DownloadedTrack = {
    trackId,
    localUri,
    downloadedAt: Date.now(),
    size: fileInfo.size || 0,
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
