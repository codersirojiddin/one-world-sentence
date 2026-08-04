'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { fetchBook, BookInfo } from '@/lib/books';
import { fetchAdminStats } from '@/lib/admin';
import SentenceInput from './SentenceInput';

export default function SentenceComposer({ bookId }: { bookId: string }) {
  const { data: session, isPending } = useAuth();
  const [book, setBook] = useState<BookInfo | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingBook(true);
    fetchBook(bookId).then((b) => {
      if (!cancelled) {
        setBook(b);
        setLoadingBook(false);
      }
    });
    if (session?.user) {
      fetchAdminStats().then(({ ok }) => {
        if (!cancelled) setIsAdmin(ok);
      });
    } else {
      setIsAdmin(false);
    }
    return () => {
      cancelled = true;
    };
  }, [bookId, session?.user?.id]);

  if (isPending || loadingBook) {
    return <div className="border-t border-ink/10 pt-6 mt-8 h-24 animate-pulse" />;
  }

  if (!session?.user) {
    return (
      <div className="border-t border-ink/10 pt-6 mt-8 text-center">
        <p className="text-sm text-ink/60">
          <Link href="/auth/sign-in" className="text-library font-medium hover:text-ember transition-colors">
            Sign in
          </Link>{' '}
          to add the next sentence.
        </p>
      </div>
    );
  }

  const canWrite = book && (book.is_owner || book.is_collaborator || book.is_open_for_public);

  if (!canWrite) {
    return (
      <div className="border-t border-ink/10 pt-6 mt-8 text-center">
        <p className="text-sm text-ink/50 italic">
          This book is invite-only right now. Ask the owner to add you as a collaborator, or check
          back if they open it up for public contributions.
        </p>
      </div>
    );
  }

  return <SentenceInput bookId={bookId} maxLength={isAdmin ? 5000 : 280} />;
}
