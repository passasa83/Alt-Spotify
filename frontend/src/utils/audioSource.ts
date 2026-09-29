import Hls from 'hls.js';
import { getHlsStreamUrl, getTrackStreamUrl } from '@/api/tracks';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';

// One HLS.js instance per <audio> element. The Player swaps elements during
// crossfades, so the instance has to follow the element, not the component.
const hlsInstances = new WeakMap<HTMLAudioElement, Hls>();

// Read the token on every request so a token refreshed mid-track is picked up.
const setAuthHeader = (xhr: XMLHttpRequest) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }
};

export const detachSource = (audio: HTMLAudioElement) => {
  hlsInstances.get(audio)?.destroy();
  hlsInstances.delete(audio);
};

const attachDirect = (audio: HTMLAudioElement, track: Track) => {
  audio.src = getTrackStreamUrl(track.id);
};

/**
 * Point `audio` at `track`: adaptive HLS when the track has been transcoded
 * and the browser supports Media Source Extensions, the original file
 * otherwise. A fatal HLS error falls back to the original file.
 */
export const attachSource = (audio: HTMLAudioElement, track: Track, preferHls = true) => {
  detachSource(audio);

  if (!preferHls || !track.hls_path || !Hls.isSupported()) {
    attachDirect(audio, track);
    return;
  }

  const hls = new Hls({ xhrSetup: setAuthHeader });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    const resumeAt = audio.currentTime;
    detachSource(audio);
    attachDirect(audio, track);
    audio.addEventListener(
      'loadedmetadata',
      () => {
        audio.currentTime = resumeAt;
      },
      { once: true },
    );
    if (usePlayerStore.getState().isPlaying) {
      audio.play().catch(() => {});
    }
  });
  hls.loadSource(getHlsStreamUrl(track.id));
  hls.attachMedia(audio);
  hlsInstances.set(audio, hls);
};
