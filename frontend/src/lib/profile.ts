import { apiFetch } from './sse';
import { BookInfo } from './books';

export interface Profile {
  username: string;
  display_name?: string;
  bio?: string;
  created_at: string;
  username_changed_at?: string | null;
  sentence_count: number;
}

export interface MyProfileResponse {
  exists: boolean;
  profile?: Profile;
}

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  const res = await apiFetch('/api/profiles/me');
  if (!res.ok) return { exists: false };
  return res.json();
}

export interface UpdateProfilePayload {
  username?: string;
  display_name?: string;
  bio?: string;
}

export async function updateMyProfile(payload: UpdateProfilePayload): Promise<Response> {
  return apiFetch('/api/profiles/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/profiles/check?username=${encodeURIComponent(username)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.available;
  } catch {
    return false;
  }
}

export interface PublicProfileResponse {
  profile: Profile;
  books: BookInfo[];
}

export async function fetchPublicProfile(username: string): Promise<PublicProfileResponse | null> {
  try {
    const res = await apiFetch(`/api/profiles/${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Days remaining before the username can be changed again (0 if already allowed).
export function usernameCooldownDaysLeft(changedAt?: string | null): number {
  if (!changedAt) return 0;
  const changed = new Date(changedAt).getTime();
  const cooldownMs = 15 * 24 * 60 * 60 * 1000;
  const remaining = changed + cooldownMs - Date.now();
  return remaining > 0 ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;
}
