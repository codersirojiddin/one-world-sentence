'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/sse';
import { useAuth } from '@/lib/auth';
import { BookInfo } from '@/lib/books';

const GENRE_SUGGESTIONS = ['Sci-Fi', 'Horror', 'Dark Academia', 'Romance', 'Mystery', 'Fantasy', 'General'];

export default function MyBooksPage() {
  const { data: session, isPending } = useAuth();
  const [myBooks, setMyBooks] = useState<BookInfo[] | null>(null);
  const [bookshelf, setBookshelf] = useState<BookInfo[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reload() {
    const [mine, shelf] = await Promise.all([
      apiFetch('/api/books/mine').then((r) => (r.ok ? r.json() : [])),
      apiFetch('/api/books/bookmarked').then((r) => (r.ok ? r.json() : [])),
    ]);
    setMyBooks(mine);
    setBookshelf(shelf);
  }

  useEffect(() => {
    if (session?.user) reload();
  }, [session?.user]);

  if (isPending) return <p className="text-center text-ink/40 py-12">Loading...</p>;

  if (!session?.user) {
    return (
      <div className="text-center py-16">
        <p className="text-ink/60 mb-4">Sign in to write your own book or manage your bookshelf.</p>
        <Link
          href="/auth/sign-in"
          className="bg-library text-parchment px-5 py-2 rounded-lg text-sm hover:bg-library/90 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-library">My Books</h1>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-sm bg-library text-parchment px-4 py-2 rounded-lg hover:bg-library/90 transition-colors"
          >
            {showCreate ? 'Cancel' : '+ Write a new book'}
          </button>
        </div>

        {showCreate && (
          <CreateBookForm
            onCreated={() => {
              setShowCreate(false);
              reload();
            }}
          />
        )}

        {myBooks === null && <p className="text-ink/40 text-center py-8">Loading your books...</p>}
        {myBooks && myBooks.length === 0 && !showCreate && (
          <p className="text-ink/40 italic text-center py-8">
            You haven&apos;t started a book yet — click &ldquo;Write a new book&rdquo; above.
          </p>
        )}

        <div className="space-y-4">
          {myBooks?.map((book) => (
            <BookCard key={book.id} book={book} onChanged={reload} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-library mb-4">My Bookshelf</h2>
        {bookshelf === null && <p className="text-ink/40 text-center py-8">Loading...</p>}
        {bookshelf && bookshelf.length === 0 && (
          <p className="text-ink/40 italic text-center py-8">
            No bookmarks yet — bookmark a story from its reader page to save it here.
          </p>
        )}
        <div className="grid gap-3">
          {bookshelf?.map((book) => (
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

function CreateBookForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState(GENRE_SUGGESTIONS[0]);
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'solo' | 'collab'>('solo');
  const [isOpenForPublic, setIsOpenForPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title, genre, description, mode, is_open_for_public: isOpenForPublic }),
      });
      if (!res.ok) {
        setError('Could not create the book. Please try again.');
        return;
      }
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink/10 rounded-xl p-5 mb-6 bg-white space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Book title"
        className="w-full border border-ink/20 rounded-lg p-2 text-sm"
        required
      />
      <select
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        className="w-full border border-ink/20 rounded-lg p-2 text-sm"
      >
        {GENRE_SUGGESTIONS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)"
        rows={2}
        className="w-full border border-ink/20 rounded-lg p-2 text-sm resize-none"
      />

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'solo'} onChange={() => setMode('solo')} />
          Solo — only I write sentences (unlimited, no 24h wait)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'collab'} onChange={() => setMode('collab')} />
          Collaborative — invite specific people to co-write with me
        </label>
        <label className="flex items-center gap-2 mt-1 pt-2 border-t border-ink/10">
          <input
            type="checkbox"
            checked={isOpenForPublic}
            onChange={(e) => setIsOpenForPublic(e.target.checked)}
          />
          Also open to the public — any signed-in reader may add 1 sentence every 24 hours
        </label>
      </div>

      {error && <p className="text-ember text-sm">{error}</p>}

      <button
        type="submit"
        disabled={creating}
        className="bg-ember text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40"
      >
        {creating ? 'Creating...' : 'Create book'}
      </button>
    </form>
  );
}

function BookCard({ book, onChanged }: { book: BookInfo; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [isOpenForPublic, setIsOpenForPublic] = useState(book.is_open_for_public);
  const [saving, setSaving] = useState(false);
  const [collaborators, setCollaborators] = useState<
    { id: string; invited_email: string; user_name: string | null; status: string }[] | null
  >(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  async function loadCollaborators() {
    const res = await apiFetch(`/api/books/${book.id}/collaborators`);
    if (res.ok) setCollaborators(await res.json());
  }

  async function togglePublic() {
    setSaving(true);
    const next = !isOpenForPublic;
    const res = await apiFetch(`/api/books/${book.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_open_for_public: next }),
    });
    if (res.ok) setIsOpenForPublic(next);
    setSaving(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    const res = await apiFetch(`/api/books/${book.id}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    if (res.ok) {
      setInviteEmail('');
      loadCollaborators();
    }
    setInviting(false);
  }

  async function removeCollaborator(id: string) {
    const res = await apiFetch(`/api/books/${book.id}/collaborators/${id}`, { method: 'DELETE' });
    if (res.ok) loadCollaborators();
  }

  return (
    <div className="border border-ink/10 rounded-xl bg-white overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div>
          <Link href={`/?book_id=${book.id}`} className="font-semibold hover:text-ember transition-colors">
            {book.title}
          </Link>
          <p className="text-xs text-ink/40 mt-0.5">
            {book.genre} · {book.mode === 'collab' ? 'collaborative' : 'solo'}
            {book.is_collaborator && !book.is_owner ? ' · you are a collaborator' : ''}
          </p>
        </div>
        {book.is_owner && (
          <button
            onClick={() => {
              setExpanded((v) => !v);
              if (!collaborators) loadCollaborators();
            }}
            className="text-xs text-library hover:text-ember transition-colors"
          >
            {expanded ? 'Hide settings' : 'Settings'}
          </button>
        )}
      </div>

      {expanded && book.is_owner && (
        <div className="border-t border-ink/10 p-4 bg-parchment/60 space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isOpenForPublic} onChange={togglePublic} disabled={saving} />
            Open for public contributions (1 sentence / 24h per person)
          </label>

          {book.mode === 'collab' && (
            <div>
              <p className="font-medium mb-2">Collaborators</p>
              <form onSubmit={invite} className="flex gap-2 mb-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="collaborator@email.com"
                  className="flex-1 border border-ink/20 rounded-lg p-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={inviting}
                  className="bg-library text-parchment px-3 py-2 rounded-lg text-xs disabled:opacity-40"
                >
                  Invite
                </button>
              </form>
              <ul className="space-y-1">
                {collaborators?.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-ink/60">
                    <span>
                      {c.user_name || c.invited_email}{' '}
                      <span className="text-xs text-ink/30">
                        ({c.status === 'active' ? 'joined' : 'pending — waiting for them to sign in'})
                      </span>
                    </span>
                    <button onClick={() => removeCollaborator(c.id)} className="text-xs text-ember hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
                {collaborators && collaborators.length === 0 && (
                  <li className="text-ink/30 text-xs">No collaborators yet.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
