import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Track, Album, Artist, Playlist } from '../types';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  LibraryTab: undefined;
  PodcastsTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  TrackDetail: { track: Track };
  AlbumDetail: { albumId: string };
  ArtistDetail: { artistId: string };
  PlaylistDetail: { playlistId: string };
  PodcastDetail: { id: string };
  Stats: undefined;
  JamSession: { sessionId?: string };
  Settings: undefined;
  FullScreenPlayer: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
