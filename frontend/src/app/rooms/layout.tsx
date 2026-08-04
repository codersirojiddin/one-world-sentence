import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Genre Rooms',
  description:
    'Browse collaborative story rooms by genre — Sci-Fi, Horror, Dark Academia, Romance, Mystery, Fantasy, and more.',
};

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
