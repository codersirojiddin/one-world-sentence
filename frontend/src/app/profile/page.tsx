'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/sse';
import { BookInfo } from '@/lib/books';
import {
  fetchMyProfile,
  updateMyProfile,
  checkUsernameAvailable,
  usernameCooldownDaysLeft,
  Profile,
} from '@/lib/profile';

export default function ProfilePage() {
  const { data: session, isPending } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [books, setBooks] = useState<BookInfo[] | null>(null);

  async function reload() {
    const [{ exists, profile: p }, mine] = await Promise.all([
      fetchMyProfile(),
      apiFetch('/api/books/mine').then((r) => (r.ok ? r.json() : [])),
    ]);
    setProfile(exists ? p ?? null : null);
    setBooks(mine);
    setLoading(false);
  }

  useEffect(() => {
    if (session?.user) reload();
    else setLoading(false);
  }, [session?.user]);

  if (isPending || loading) return <p className="text-center text-ink/40 py-12">Loading...</p>;

  if (!session?.user) {
    return (
      <div className="text-center py-16">
        <p className="text-ink/60 mb-4">Sign in to set up your profile.</p>
        <Link
          href="/auth/sign-in"
          className="bg-library text-parchment px-5 py-2 rounded-lg text-sm hover:bg-library/90 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-library mb-2 text-center">Choose your username</h1>
        <p className="text-sm text-ink/50 text-center mb-6">
          This is how other writers will find and mention you. You can change it once every 15 days.
        </p>
        <ProfileForm onSaved={reload} />
      </div>
    );
  }

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

      <section className="max-w-md mx-auto">
        <h2 className="text-sm font-semibold text-ink/60 mb-3">Edit profile</h2>
        <ProfileForm existing={profile} onSaved={reload} />
      </section>

      <section>
        <h2 className="text-lg font-bold text-library mb-4">My Books</h2>
        {books && books.length === 0 && (
          <p className="text-ink/40 italic text-center py-6">
            <Link href="/my-books" className="text-library hover:text-ember transition-colors">
              Write your first book
            </Link>
          </p>
        )}
        <div className="grid gap-3">
          {books?.map((book) => (
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

function ProfileForm({ existing, onSaved }: { existing?: Profile; onSaved: () => void }) {
  const [username, setUsername] = useState(existing?.username ?? '');
  const [displayName, setDisplayName] = useState(existing?.display_name ?? '');
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [availability, setAvailability] = useState<'unknown' | 'checking' | 'available' | 'taken'>('unknown');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cooldownDays = existing ? usernameCooldownDaysLeft(existing.username_changed_at) : 0;
  const usernameLocked = cooldownDays > 0;

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed === existing?.username) {
      setAvailability('unknown');
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      setAvailability('unknown');
      return;
    }
    setAvailability('checking');
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(trimmed);
      setAvailability(available ? 'available' : 'taken');
    }, 400);
    return () => clearTimeout(timer);
  }, [username, existing?.username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateMyProfile({
        username: username.trim().toLowerCase(),
        display_name: displayName,
        bio,
      });
      if (res.status === 409) {
        setError('That username is already taken.');
        return;
      }
      if (res.status === 429) {
        setError('You can only change your username once every 15 days.');
        return;
      }
      if (res.status === 400) {
        setError('Username must be 3-20 characters: lowercase letters, numbers, underscore only.');
        return;
      }
      if (!res.ok) {
        setError('Could not save your profile. Please try again.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink/10 rounded-xl p-5 bg-white space-y-3">
      <div>
        <label className="block text-xs text-ink/50 mb-1">Username</label>
        <div className="flex items-center gap-2">
          <span className="text-ink/40">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            disabled={usernameLocked}
            className="flex-1 border border-ink/20 rounded-lg p-2 text-sm disabled:bg-ink/5 disabled:text-ink/40"
          />
        </div>
        {usernameLocked && (
          <p className="text-xs text-ink/40 mt-1">
            You can change your username again in {cooldownDays} day{cooldownDays === 1 ? '' : 's'}.
          </p>
        )}
        {!usernameLocked && availability === 'checking' && (
          <p className="text-xs text-ink/40 mt-1">Checking availability...</p>
        )}
        {!usernameLocked && availability === 'available' && (
          <p className="text-xs text-green-700 mt-1">Available!</p>
        )}
        {!usernameLocked && availability === 'taken' && (
          <p className="text-xs text-ember mt-1">That username is taken.</p>
        )}
      </div>

      <div>
        <label className="block text-xs text-ink/50 mb-1">Display name (optional)</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border border-ink/20 rounded-lg p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-ink/50 mb-1">Bio (optional)</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 280))}
          rows={3}
          className="w-full border border-ink/20 rounded-lg p-2 text-sm resize-none"
        />
        <p className="text-xs text-ink/30 mt-1 text-right">{280 - bio.length} characters remaining</p>
      </div>

      {error && <p className="text-ember text-sm">{error}</p>}

      <button
        type="submit"
        disabled={saving || !username.trim()}
        className="bg-library text-parchment px-4 py-2 rounded-lg text-sm disabled:opacity-40 hover:bg-library/90 transition-colors"
      >
        {saving ? 'Saving...' : 'Save profile'}
      </button>
    </form>
  );
}
