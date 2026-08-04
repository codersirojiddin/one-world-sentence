'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import {
  fetchAdminStats,
  fetchAdminBooks,
  deleteAdminBook,
  fetchAdminSentences,
  updateAdminSentenceStatus,
  fetchAdminUsers,
  banUser,
  unbanUser,
  AdminStats,
  AdminBook,
  AdminSentence,
  AdminUser,
} from '@/lib/admin';

type Tab = 'overview' | 'books' | 'flagged' | 'users';

export default function AdminPage() {
  const { data: session, isPending } = useAuth();
  const [access, setAccess] = useState<'checking' | 'denied' | 'granted'>('checking');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!session?.user) return;
    fetchAdminStats().then(({ ok }) => setAccess(ok ? 'granted' : 'denied'));
  }, [session?.user]);

  if (isPending) return <p className="text-center text-ink/40 py-12">Loading...</p>;

  if (!session?.user) {
    return (
      <div className="text-center py-16">
        <p className="text-ink/60 mb-4">Sign in with an admin account to continue.</p>
        <Link href="/auth/sign-in" className="bg-library text-parchment px-5 py-2 rounded-lg text-sm">
          Sign in
        </Link>
      </div>
    );
  }

  if (access === 'checking') return <p className="text-center text-ink/40 py-12">Checking access...</p>;

  if (access === 'denied') {
    return (
      <p className="text-center text-ink/40 py-16 italic">
        You don&apos;t have admin access on this account.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-library mb-6">Admin Panel</h1>
      <div className="flex gap-1 border-b border-ink/10 mb-6 text-sm">
        {(
          [
            ['overview', 'Overview'],
            ['books', 'Books'],
            ['flagged', 'Flagged Content'],
            ['users', 'Users'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key ? 'border-library text-library font-medium' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'books' && <BooksTab />}
      {tab === 'flagged' && <FlaggedTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="border border-ink/10 rounded-xl p-4 bg-white text-center">
      <div className="text-2xl font-bold text-library">{value ?? '—'}</div>
      <div className="text-xs text-ink/50 mt-1">{label}</div>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    fetchAdminStats().then(({ data }) => setStats(data ?? null));
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Total users" value={stats?.total_users} />
      <StatCard label="Total books" value={stats?.total_books} />
      <StatCard label="Collaborative books" value={stats?.collaborative_books} />
      <StatCard label="Open-for-public books" value={stats?.public_books} />
      <StatCard label="Total sentences" value={stats?.total_sentences} />
      <StatCard label="Soft-hidden sentences" value={stats?.soft_hidden_sentences} />
      <StatCard label="Deleted sentences" value={stats?.deleted_sentences} />
      <StatCard label="Profiles created" value={stats?.profiles_created} />
      <StatCard label="Banned users" value={stats?.banned_users} />
    </div>
  );
}

function BooksTab() {
  const [books, setBooks] = useState<AdminBook[] | null>(null);

  function load() {
    fetchAdminBooks().then(setBooks);
  }
  useEffect(load, []);

  async function handleDelete(book: AdminBook) {
    if (!confirm(`Permanently delete "${book.title}" and all of its sentences? This cannot be undone.`)) return;
    if (await deleteAdminBook(book.id)) load();
  }

  if (!books) return <p className="text-ink/40 text-center py-8">Loading...</p>;

  return (
    <div className="space-y-2">
      {books.map((book) => (
        <div key={book.id} className="border border-ink/10 rounded-xl p-4 bg-white flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{book.title}</span>
              {book.is_global && <span className="text-xs bg-library/10 text-library px-2 py-0.5 rounded-full">global</span>}
              <span className="text-xs uppercase text-ember/80">{book.genre}</span>
            </div>
            <p className="text-xs text-ink/40 mt-1">
              {book.sentence_count} sentence{book.sentence_count === 1 ? '' : 's'}
              {book.flagged_count > 0 && <span className="text-ember"> · {book.flagged_count} flagged</span>}
              {' · '}owner: {book.owner_name ?? '—'} {' · '}mode: {book.mode}
              {book.is_open_for_public && ' · open for public'}
            </p>
          </div>
          {!book.is_global && (
            <button
              onClick={() => handleDelete(book)}
              className="text-xs px-3 py-1.5 rounded-lg border border-ember/30 text-ember hover:bg-ember/10 transition-colors shrink-0"
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FlaggedTab() {
  const [status, setStatus] = useState('soft_hidden');
  const [sentences, setSentences] = useState<AdminSentence[] | null>(null);

  function load() {
    fetchAdminSentences(status).then(setSentences);
  }
  useEffect(load, [status]);

  async function handleUpdate(id: string, newStatus: string) {
    if (newStatus === 'deleted' && !confirm('Permanently purge this sentence? This cannot be undone.')) return;
    if (await updateAdminSentenceStatus(id, newStatus)) load();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 text-sm">
        {[
          ['soft_hidden', 'Soft-hidden'],
          ['deleted', 'Deleted'],
          ['all', 'All'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`px-3 py-1.5 rounded-lg border transition-colors ${
              status === key ? 'border-library text-library bg-library/5' : 'border-ink/15 text-ink/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!sentences && <p className="text-ink/40 text-center py-8">Loading...</p>}
      {sentences && sentences.length === 0 && (
        <p className="text-ink/40 italic text-center py-8">Nothing here.</p>
      )}

      <div className="space-y-2">
        {sentences?.map((s) => (
          <div key={s.id} className="border border-ink/10 rounded-xl p-4 bg-white">
            <p className="text-sm">{s.content}</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-ink/40">
                {s.book_title} · {s.author_name ?? 'unknown'} · {s.flag_count} flags · {s.status}
              </p>
              <div className="flex gap-2">
                {s.status !== 'visible' && (
                  <button
                    onClick={() => handleUpdate(s.id, 'visible')}
                    className="text-xs px-2.5 py-1 rounded-lg border border-green-700/30 text-green-700 hover:bg-green-700/10 transition-colors"
                  >
                    Restore
                  </button>
                )}
                {s.status !== 'deleted' && (
                  <button
                    onClick={() => handleUpdate(s.id, 'deleted')}
                    className="text-xs px-2.5 py-1 rounded-lg border border-ember/30 text-ember hover:bg-ember/10 transition-colors"
                  >
                    Purge
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);

  function load() {
    fetchAdminUsers().then(setUsers);
  }
  useEffect(load, []);

  async function handleBan(user: AdminUser) {
    const reason = prompt(`Reason for banning ${user.username ?? user.user_id}?`) ?? '';
    if (await banUser(user.user_id, reason)) load();
  }
  async function handleUnban(user: AdminUser) {
    if (await unbanUser(user.user_id)) load();
  }

  if (!users) return <p className="text-ink/40 text-center py-8">Loading...</p>;

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.user_id} className="border border-ink/10 rounded-xl p-4 bg-white flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{u.username ? `@${u.username}` : u.display_name ?? 'Unnamed writer'}</span>
              {u.banned && <span className="text-xs bg-ember/10 text-ember px-2 py-0.5 rounded-full">banned</span>}
            </div>
            <p className="text-xs text-ink/40 mt-1">
              {u.email ?? 'no email on file'} · {u.sentence_count} sentences · {u.book_count} books
              {u.banned && u.ban_reason && <span> · reason: {u.ban_reason}</span>}
            </p>
          </div>
          {u.banned ? (
            <button
              onClick={() => handleUnban(u)}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-700/30 text-green-700 hover:bg-green-700/10 transition-colors shrink-0"
            >
              Unban
            </button>
          ) : (
            <button
              onClick={() => handleBan(u)}
              className="text-xs px-3 py-1.5 rounded-lg border border-ember/30 text-ember hover:bg-ember/10 transition-colors shrink-0"
            >
              Ban
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
