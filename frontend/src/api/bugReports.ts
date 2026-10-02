import client from './client';

export type BugCategory = 'playback' | 'display' | 'account' | 'other';
export type BugStatus = 'new' | 'in_progress' | 'resolved' | 'wont_fix';

export interface BugReport {
  id: string;
  category: BugCategory;
  description: string;
  page_url: string | null;
  user_agent: string | null;
  context: Record<string, any> | null;
  status: BugStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  reporter: { id: string; pseudo: string; email: string } | null;
}

export interface BugReportPage {
  items: BugReport[];
  total: number;
  page: number;
  pages: number;
  counts: Record<BugStatus, number>;
}

export async function sendBugReport(body: {
  category: BugCategory;
  description: string;
  page_url?: string;
  context?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const response = await client.post('/bug-reports', body);
  return response.data;
}

export async function getBugReports(status?: BugStatus, page = 1): Promise<BugReportPage> {
  const response = await client.get('/admin/bug-reports', { params: { status, page } });
  return response.data;
}

export async function updateBugReport(id: string, body: { status?: BugStatus; admin_note?: string }): Promise<BugReport> {
  const response = await client.patch(`/admin/bug-reports/${id}`, body);
  return response.data;
}
