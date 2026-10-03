import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { API_BASE_URL } from '../api/session';
import { withMediaToken } from '../api/mediaToken';

const LOCAL_PREFIX = 'local_cover:';

/**
 * Cover art from the API: "local_cover:<path>" covers come from the music
 * folders through an authenticated endpoint, so their URL needs the media
 * token; other covers are plain URLs.
 */
export default function CoverImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri?: string | null }) {
  const [resolved, setResolved] = useState<string | null>(uri && !uri.startsWith(LOCAL_PREFIX) ? uri : null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setResolved(null);
    } else if (!uri.startsWith(LOCAL_PREFIX)) {
      setResolved(uri);
    } else {
      const path = uri.slice(LOCAL_PREFIX.length);
      withMediaToken(`${API_BASE_URL}/local/covers${path.startsWith('/') ? path : `/${path}`}`)
        .then((url) => !cancelled && setResolved(url))
        .catch(() => !cancelled && setResolved(null));
    }
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!resolved) return null;
  return <Image {...props} source={{ uri: resolved }} />;
}
