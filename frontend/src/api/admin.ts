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
