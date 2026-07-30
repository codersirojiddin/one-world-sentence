'use client';

import { useRouter } from 'next/navigation';
import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import { authClient } from '@/lib/auth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href: string) => router.push(href)}
      replace={(href: string) => router.replace(href)}
      redirectTo="/"
      social={{ providers: ['google'] }}
      credentials={true}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
