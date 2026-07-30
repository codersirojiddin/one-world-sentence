'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/sse';
import { useAuth } from '@/lib/auth';

export default function BookmarkButton({ bookId }: { bookId: string }) {
  const { data: session } = useAuth();
  const [bookmarked, setBookmarked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setBookmarked(null);
      return;
    }
    let cancelled = false;
    apiFetch('/api/books/bookmarked')
      .then((res) => (res.ok ? res.json() : []))
      .then((books: { id: string }[]) => {
        if (!cancelled) setBookmarked(books.some((b) => b.id === bookId));
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, session?.user]);

  if (!session?.user || bookmarked === null) return null;

  async function toggle() {
    const res = await apiFetch(`/api/books/${bookId}/bookmark`, { method: 'POST', body: '{}' });
    if (res.ok) {
      const data = await res.json();
      setBookmarked(data.bookmarked);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        bookmarked
          ? 'bg-ember/10 border-ember/40 text-ember'
          : 'border-ink/20 text-ink/50 hover:border-ink/40'
      }`}
    >
      {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
    </button>
  );
}
