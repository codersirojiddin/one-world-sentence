'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import StoryFeed from '@/components/StoryFeed';
import SentenceComposer from '@/components/SentenceComposer';
import BookmarkButton from '@/components/BookmarkButton';
import ExportPdfButton from '@/components/ExportPdfButton';
import { fetchBook, BookInfo } from '@/lib/books';

const GLOBAL_BOOK_ID = '00000000-0000-0000-0000-000000000001';

function StoryPage() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get('book_id') || GLOBAL_BOOK_ID;
  const isGlobal = bookId === GLOBAL_BOOK_ID;
  const [book, setBook] = useState<BookInfo | null>(null);

  useEffect(() => {
    fetchBook(bookId).then(setBook);
  }, [bookId]);

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-library">
          {isGlobal ? 'The Global Live Story' : book?.title ?? 'Story'}
        </h1>
        <p className="text-ink/50 text-sm mt-1">
          {isGlobal
            ? 'Written one sentence at a time, by everyone, forever unfinished.'
            : book
            ? `${book.genre} · started by ${book.owner_name ?? 'someone'}${book.mode === 'collab' ? ' · collaborative' : ''}`
            : ' '}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          {!isGlobal && book && <BookmarkButton bookId={bookId} initialBookmarked={book.is_bookmarked} />}
          <ExportPdfButton bookId={bookId} bookTitle={isGlobal ? 'One World Sentence' : book?.title ?? 'Story'} />
        </div>
      </div>

      <StoryFeed bookId={bookId} />
      <SentenceComposer bookId={bookId} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="py-12" />}>
      <StoryPage />
    </Suspense>
  );
}
