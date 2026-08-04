import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Books',
  robots: { index: false, follow: false },
};

export default function MyBooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
