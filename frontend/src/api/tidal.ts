import client from './client';

export const tidalSearchTracks = async (q: string, limit = 20) => {
  const response = await client.get('/tidal/search', { params: { q, type: 'tracks', limit } });
  return response.data.tracks || [];
};

export const tidalSearchArtists = async (q: string, limit = 20) => {
  const response = await client.get('/tidal/search', { params: { q, type: 'artists', limit } });
  return response.data.artists || [];
};

export const tidalSearchAlbums = async (q: string, limit = 20) => {
  const response = await client.get('/tidal/search', { params: { q, type: 'albums', limit } });
  return response.data.albums || [];
};

export const tidalGetTrack = async (trackId: number) => {
  const response = await client.get(`/tidal/tracks/${trackId}`);
  return response.data;
};

export const tidalGetArtist = async (artistId: number) => {
  const response = await client.get(`/tidal/artists/${artistId}`);
  return response.data;
};

export const tidalGetArtistDiscography = async (artistId: number, limit = 50) => {
  const response = await client.get(`/tidal/artists/${artistId}/discography`, { params: { limit } });
  return response.data;
};

export const tidalGetAlbum = async (albumId: number) => {
  const response = await client.get(`/tidal/albums/${albumId}`);
  return response.data;
};

export const tidalGetRecommendations = async (trackId: number) => {
  const response = await client.get(`/tidal/recommendations/${trackId}`);
  return response.data.tracks || [];
};

export const tidalGetLyrics = async (trackId: number) => {
  const response = await client.get(`/tidal/tracks/${trackId}/lyrics`);
  return response.data.lyrics;
};

export const tidalEnrichTrack = async (trackId: string) => {
  const response = await client.post(`/tidal/enrich/${trackId}`);
  return response.data;
};

export const tidalGetStreamUrl = (trackId: number): string => {
  return `/api/v1/tidal/tracks/${trackId}/stream`;
};
