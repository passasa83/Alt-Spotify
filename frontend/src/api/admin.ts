import client from './client';

export interface AdminDashboardData {
  total_users: number;
  total_tracks: number;
  plays_today: number;
  storage_used: string;
  active_jam_sessions: number;
}

export interface AdminUser {
  id: string;
  email: string;
  pseudo: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  country?: string | null;
  is_child_account?: boolean;
  play_count?: number;
  last_played_at?: string | null;
  last_seen_at?: string | null;
  playlist_count?: number;
  device_count?: number;
}

export type OverviewWarningLevel = 'error' | 'warning' | 'info';

export interface OverviewWarning {
  level: OverviewWarningLevel;
  code: string;
  params: Record<string, string | number>;
}

export interface MusicDirStatus {
  setting: string;
  path: string;
  exists: boolean;
  writable: boolean;
  audio_files: number;
  capped: boolean;
}

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    active: number;
    admins: number;
    new_7d: number;
    listeners_7d: number;
    pending_invites: number;
  };
  catalogue: {
    total: number;
    playable: number;
    no_audio: number;
    local_files: number;
    object_storage: number;
    hls: number;
    missing_files: number;
    missing_examples: string[];
    purgeable?: number;
    mergeable?: number;
  };
  music_dirs: MusicDirStatus[];
  services: Record<string, { ok: boolean; detail?: string | null }>;
  config: { key: string; value: string | number | boolean }[];
  areas: AdminArea[];
  checks: AdminCheck[];
  warnings: OverviewWarning[];
}

export type CheckStatus = 'ok' | 'info' | 'warning' | 'error';
export type AdminAreaName = 'playback' | 'storage' | 'search' | 'database' | 'accounts' | 'security';

export interface AdminArea {
  area: AdminAreaName;
  status: CheckStatus;
  problems: number;
}

export interface AdminCheck {
  area: AdminAreaName;
  status: CheckStatus;
  code: string;
  params: Record<string, string | number>;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await client.get('/admin/overview');
  return response.data;
}

export interface CatalogueStats {
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  storage_used: string;
  tracks_by_genre: { genre: string; count: number }[];
  most_played: { title: string; artist: string; play_count: number }[];
  storage_per_artist: { artist: string; storage: string }[];
}

export interface PlaysPerDay {
  date: string;
  plays: number;
}

export interface ActiveUsersPerDay {
  date: string;
  active_users: number;
}

export interface TopContent {
  top_tracks: { title: string; artist: string; play_count: number }[];
  top_artists: { id: string; name: string; play_count: number }[];
  top_albums: { title: string; artist: string; play_count: number }[];
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const response = await client.get('/admin/dashboard');
  return response.data;
}

export async function getAdminUsers(
  page = 1,
  pageSize = 20,
  search?: string,
  role?: string
): Promise<{ items: AdminUser[]; total: number; pages: number }> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (search) params.search = search;
  if (role) params.role = role;
  const response = await client.get('/admin/users', { params });
  return response.data;
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await client.put(`/admin/users/${userId}/role`, { role });
}

export async function toggleUserActive(userId: string, active: boolean): Promise<void> {
  await client.put(`/admin/users/${userId}/active`, { is_active: active });
}

export async function deleteUser(userId: string): Promise<void> {
  await client.delete(`/admin/users/${userId}`);
}

export async function getCatalogueStats(): Promise<CatalogueStats> {
  const response = await client.get('/admin/catalogue/stats');
  return response.data;
}

export async function getPlaysPerDay(): Promise<PlaysPerDay[]> {
  const response = await client.get('/admin/analytics/plays-per-day');
  return response.data;
}

export async function getActiveUsers(): Promise<ActiveUsersPerDay[]> {
  const response = await client.get('/admin/analytics/active-users');
  return response.data;
}

export async function getTopContent(): Promise<TopContent> {
  const response = await client.get('/admin/analytics/top-content');
  return response.data;
}

export interface AdminInvite {
  id: string;
  token: string;
  email: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  is_revoked: boolean;
  used_by: string | null;
  created_at: string;
  invite_link: string;
}

export async function getAdminInvites(): Promise<AdminInvite[]> {
  const response = await client.get('/admin/invites');
  return response.data;
}

export async function createInvite(
  email?: string,
  maxUses: number = 1,
  expiresInDays: number = 30
): Promise<AdminInvite> {
  const response = await client.post('/admin/invites', {
    email: email || null,
    max_uses: maxUses,
    expires_in_days: expiresInDays,
  });
  return response.data;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await client.delete(`/admin/invites/${inviteId}`);
}

/** Tracks without audio that nothing uses. `dryRun` only counts them. */
export async function purgeUnplayableTracks(dryRun: boolean, includeUsed = false): Promise<{ count: number; deleted: number }> {
  const response = await client.post('/admin/catalogue/purge-unplayable', null, {
    params: { dry_run: dryRun, include_used: includeUsed },
  });
  return response.data;
}

export interface MergeDuplicatesResult {
  count: number;
  merged: number;
  unresolved: number;
  examples: { from: string; to: string }[];
}

/** Tracks whose file is missing but whose identical copy exists elsewhere. `dryRun` only counts. */
export async function mergeMissingDuplicates(dryRun: boolean): Promise<MergeDuplicatesResult> {
  const response = await client.post('/admin/catalogue/merge-missing-duplicates', null, { params: { dry_run: dryRun } });
  return response.data;
}

/** Queue HLS transcoding for every track with a source file but no HLS yet. */
export async function transcodeMissing(): Promise<{ queued: number; already_queued: number }> {
  const response = await client.post('/upload/transcode-missing');
  return response.data;
}

export interface TranscodeTrack {
  id: string;
  title?: string;
  artist?: string | null;
  error?: string;
}

export interface TranscodeStatus {
  /** Tracks already available in HLS. */
  hls: number;
  /** Tracks with a source file (the ones that can be transcoded). */
  with_source: number;
  /** Tasks waiting in the worker queue (null if Redis can't be read). */
  queue_length: number | null;
  /** Last batch started from the admin, null if none in the last 7 days. */
  batch: {
    started_at: number;
    total: number;
    done: number;
    running: number;
    queued: number;
    failed: number;
    eta_seconds: number | null;
    running_tracks: TranscodeTrack[];
    failed_tracks: TranscodeTrack[];
  } | null;
}

export async function getTranscodeStatus(): Promise<TranscodeStatus> {
  const response = await client.get('/upload/transcode-status');
  return response.data;
}
