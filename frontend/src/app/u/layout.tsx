import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Writer Profile',
  description: "View a writer's public profile and the books they've written on One World Sentence.",
};

export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
