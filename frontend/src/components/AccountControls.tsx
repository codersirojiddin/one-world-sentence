'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient, useAuth } from '@/lib/auth';

export default function AccountControls() {
  const router = useRouter();
  const { data, isPending } = useAuth();

  if (isPending) {
    return <div className="w-20 h-8" />;
  }

  if (!data?.user) {
    return (
      <Link
        href="/auth/sign-in"
        className="text-sm bg-library text-parchment px-4 py-1.5 rounded-lg hover:bg-library/90 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/my-books" className="text-ink/70 hover:text-ember transition-colors">
        My Books
      </Link>
      <span className="text-ink/50 hidden sm:inline">{data.user.name || data.user.email}</span>
      <button
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
        className="text-ink/50 hover:text-ember transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
