import type { Metadata } from 'next';
import Link from 'next/link';
import AuthProvider from '@/components/AuthProvider';
import AccountControls from '@/components/AccountControls';
import Footer from '@/components/Footer';
import '@neondatabase/auth-ui/css';
import './globals.css';

const SITE_URL = 'https://oneworldsentence.site';
const TITLE = 'One World Sentence — The Internet is Writing a Book';
const DESCRIPTION =
  'Join thousands of people in writing a single story together. One sentence every 24 hours. Vote on plot twists and shape the next line!';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · One World Sentence',
  },
  description: DESCRIPTION,
  keywords: [
    'one world sentence',
    'collaborative story writing',
    'internet writes a book',
    'interactive fiction',
    'crowdsourced novel',
    'community story',
    'daily writing game',
    'collaborative novel online',
    'write a story together',
    'one sentence a day',
  ],
  authors: [{ name: 'One World Sentence' }],
  creator: 'One World Sentence',
  publisher: 'One World Sentence',
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'One World Sentence',
    title: TITLE,
    description: 'One sentence every 24 hours. No single author, just collective chaos and creativity. Add your line today!',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'One World Sentence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'One sentence every 24 hours. Vote and influence the story plot. Join the experiment!',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
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
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
