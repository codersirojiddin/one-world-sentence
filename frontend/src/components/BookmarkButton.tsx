'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/sse';
import { useAuth } from '@/lib/auth';

export default function BookmarkButton({
  bookId,
  initialBookmarked,
}: {
  bookId: string;
  initialBookmarked: boolean;
}) {
  const { data: session } = useAuth();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);

  if (!session?.user) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const previous = bookmarked;
    setBookmarked(!previous); // optimistic
    try {
      const res = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/bookmark`, { method: 'POST' });
      if (!res.ok) {
        setBookmarked(previous);
        return;
      }
      const data = await res.json();
      setBookmarked(!!data.bookmarked);
    } catch {
      setBookmarked(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={bookmarked ? 'Remove bookmark' : 'Bookmark this book'}
      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
        bookmarked
          ? 'bg-ember/10 border-ember/30 text-ember'
          : 'border-ink/20 text-ink/60 hover:border-ember/40 hover:text-ember'
      }`}
    >
      <span>{bookmarked ? '★' : '☆'}</span>
      <span>{bookmarked ? 'Bookmarked' : 'Bookmark'}</span>
    </button>
  );
}
