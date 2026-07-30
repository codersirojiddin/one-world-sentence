import { apiFetch } from './sse';

export interface BookInfo {
  id: string;
  title: string;
  genre: string;
  description?: string;
  is_global: boolean;
  owner_user_id?: string | null;
  owner_name?: string | null;
  mode: 'solo' | 'collab';
  is_open_for_public: boolean;
  is_owner: boolean;
  is_collaborator: boolean;
  created_at: string;
}

export async function fetchBook(bookId: string): Promise<BookInfo | null> {
  try {
    const res = await apiFetch(`/api/books/${encodeURIComponent(bookId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
