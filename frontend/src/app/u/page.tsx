'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchPublicProfile, PublicProfileResponse } from '@/lib/profile';

function PublicProfileView() {
  const searchParams = useSearchParams();
  const username = searchParams.get('username') ?? '';
  const [data, setData] = useState<PublicProfileResponse | null | undefined>(undefined);

  useEffect(() => {
    if (!username) {
      setData(null);
      return;
    }
    setData(undefined);
    fetchPublicProfile(username).then(setData);
  }, [username]);

  if (data === undefined) return <p className="text-center text-ink/40 py-12">Loading...</p>;

  if (data === null) {
    return <p className="text-center text-ink/40 py-16 italic">This writer couldn&apos;t be found.</p>;
  }

  const { profile, books } = data;

  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-2xl font-bold text-library">@{profile.username}</h1>
        {profile.display_name && <p className="text-ink/70 mt-1">{profile.display_name}</p>}
        {profile.bio && <p className="text-ink/50 text-sm mt-2 max-w-md mx-auto">{profile.bio}</p>}
        <p className="text-xs text-ink/30 mt-3">
          {profile.sentence_count} sentence{profile.sentence_count === 1 ? '' : 's'} written · joined{' '}
          {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-library mb-4">Books</h2>
        {books.length === 0 && <p className="text-ink/40 italic text-center py-6">No public books yet.</p>}
        <div className="grid gap-3">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/?book_id=${book.id}`}
              className="block border border-ink/10 rounded-xl p-4 bg-white hover:border-library/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{book.title}</h3>
                <span className="text-xs uppercase tracking-wide text-ember/80">{book.genre}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PublicProfilePage() {
  return (
    <Suspense fallback={<div className="py-12" />}>
      <PublicProfileView />
    </Suspense>
  );
}
