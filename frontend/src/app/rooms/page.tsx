'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/sse';
import { BookInfo } from '@/lib/books';

export default function RoomsPage() {
  const [books, setBooks] = useState<BookInfo[] | null>(null);

  useEffect(() => {
    apiFetch('/api/books')
      .then((res) => res.json())
      .then((data: BookInfo[]) => setBooks(data.filter((b) => !b.is_global)))
      .catch(() => setBooks([]));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-library">Co-Op Genre Rooms</h1>
        <Link
          href="/my-books"
          className="text-sm bg-library text-parchment px-4 py-2 rounded-lg hover:bg-library/90 transition-colors"
        >
          + Write your own
        </Link>
      </div>

      {books === null && <p className="text-ink/40 text-center py-12">Loading rooms...</p>}

      {books && books.length === 0 && (
        <p className="text-ink/40 italic text-center py-12">
          No genre rooms yet —{' '}
          <Link href="/my-books" className="text-library hover:text-ember transition-colors">
            create the first one
          </Link>
          .
        </p>
      )}

      <div className="grid gap-4">
        {books?.map((book) => (
          <Link
            key={book.id}
            href={`/?book_id=${book.id}`}
            className="block border border-ink/10 rounded-xl p-4 bg-white hover:border-library/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{book.title}</h2>
              <div className="flex items-center gap-2">
                {book.is_open_for_public && (
                  <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    Open
                  </span>
                )}
                <span className="text-xs uppercase tracking-wide text-ember/80">{book.genre}</span>
              </div>
            </div>
            {book.description && <p className="text-sm text-ink/50 mt-1">{book.description}</p>}
            <p className="text-xs text-ink/30 mt-1">
              by {book.owner_name ?? 'someone'} · {book.mode === 'collab' ? 'collaborative' : 'solo'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
