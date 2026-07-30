import type { Metadata } from 'next';
import Link from 'next/link';
import AuthProvider from '@/components/AuthProvider';
import AccountControls from '@/components/AccountControls';
import '@neondatabase/auth-ui/css';
import './globals.css';

export const metadata: Metadata = {
  title: 'One World Sentence',
  description: 'One world. One story. One sentence at a time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-serif">
        <AuthProvider>
          <header className="border-b border-ink/10 bg-parchment sticky top-0 z-10">
            <nav className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
              <Link href="/" className="text-xl font-bold tracking-tight text-library">
                One World Sentence
              </Link>
              <div className="flex items-center gap-6 text-sm text-ink/70">
                <Link href="/" className="hover:text-ember transition-colors">
                  Global Story
                </Link>
                <Link href="/rooms" className="hover:text-ember transition-colors">
                  Genre Rooms
                </Link>
                <AccountControls />
              </div>
            </nav>
          </header>
          <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
          <footer className="max-w-3xl mx-auto px-6 py-10 text-xs text-ink/40 text-center">
            Written collectively, one sentence every 24 hours, by anyone, everywhere.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
