import { apiFetch } from './sse';
import { BookInfo } from './books';

export interface AdminStats {
  total_users?: number;
  total_books?: number;
  total_sentences?: number;
  soft_hidden_sentences?: number;
  deleted_sentences?: number;
  collaborative_books?: number;
  public_books?: number;
  banned_users?: number;
  profiles_created?: number;
}

export async function fetchAdminStats(): Promise<{ ok: boolean; data?: AdminStats }> {
  const res = await apiFetch('/api/admin/stats');
  if (!res.ok) return { ok: false };
  return { ok: true, data: await res.json() };
}

export interface AdminBook extends BookInfo {
  sentence_count: number;
  flagged_count: number;
}

export async function fetchAdminBooks(): Promise<AdminBook[]> {
  const res = await apiFetch('/api/admin/books');
  if (!res.ok) return [];
  return res.json();
}

export async function deleteAdminBook(id: string): Promise<boolean> {
  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.ok;
}

export interface AdminSentence {
  id: string;
  book_id: string;
  book_title: string;
  sequence_order: number;
  content: string;
  author_user_id: string;
  author_name?: string;
  status: 'visible' | 'soft_hidden' | 'deleted';
  flag_count: number;
  created_at: string;
}

export async function fetchAdminSentences(status: string): Promise<AdminSentence[]> {
  const res = await apiFetch(`/api/admin/sentences?status=${encodeURIComponent(status)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function updateAdminSentenceStatus(id: string, status: string): Promise<boolean> {
  const res = await apiFetch(`/api/admin/sentences/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export interface AdminUser {
  user_id: string;
  username?: string;
  display_name?: string;
  email?: string;
  sentence_count: number;
  book_count: number;
  banned: boolean;
  ban_reason?: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await apiFetch('/api/admin/users');
  if (!res.ok) return [];
  return res.json();
}

export async function banUser(userId: string, reason: string): Promise<boolean> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res.ok;
}

export async function unbanUser(userId: string): Promise<boolean> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/ban`, { method: 'DELETE' });
  return res.ok;
}
