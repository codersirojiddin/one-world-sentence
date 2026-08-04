import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to One World Sentence with Google or email to start writing.',
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
