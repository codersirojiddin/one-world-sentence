export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? ''; // '' means same-origin (the Go binary serves both)

/**
 * Fetch wrapper that attaches the current Neon Auth JWT (if signed in) as a Bearer
 * token. Safe to call for public GET endpoints too — it just omits the header when
 * there's no session.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const { getAccessToken } = await import('./auth');
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // Not signed in, or auth not configured yet — proceed without a token.
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export interface SentenceCreatedEvent {
  id: string;
  book_id: string;
  sequence_order: number;
  content: string;
  author_user_id?: string | null;
  status: 'visible' | 'soft_hidden' | 'deleted';
  flag_count: number;
  created_at: string;
}

export interface SentenceModeratedEvent {
  id: string;
  status: 'visible' | 'soft_hidden' | 'deleted';
  flag_count: number;
  threshold: number;
}

interface StorySSEHandlers {
  onCreated?: (sentence: SentenceCreatedEvent) => void;
  onModerated?: (event: SentenceModeratedEvent) => void;
  onError?: (err: Event) => void;
}

/**
 * Opens a Server-Sent Events connection to /api/stream for a given book/room
 * and wires up typed handlers for "sentence.created" and "sentence.moderated".
 * Returns a cleanup function to close the connection (e.g. in a useEffect return).
 */
export function subscribeToStory(bookId: string, handlers: StorySSEHandlers): () => void {
  const url = `${API_BASE}/api/stream?book_id=${encodeURIComponent(bookId)}`;
  const source = new EventSource(url);

  const onCreated = (e: MessageEvent) => {
    try {
      handlers.onCreated?.(JSON.parse(e.data));
    } catch {
      // ignore malformed payloads
    }
  };

  const onModerated = (e: MessageEvent) => {
    try {
      handlers.onModerated?.(JSON.parse(e.data));
    } catch {
      // ignore malformed payloads
    }
  };

  source.addEventListener('sentence.created', onCreated);
  source.addEventListener('sentence.moderated', onModerated);
  source.onerror = (err) => handlers.onError?.(err);

  return () => {
    source.removeEventListener('sentence.created', onCreated);
    source.removeEventListener('sentence.moderated', onModerated);
    source.close();
  };
}
