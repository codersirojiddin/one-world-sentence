'use client';

import { createInternalNeonAuth } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// Public (non-secret) Auth URL from the Neon Console → your project → "Auth" tab.
// Example: https://ep-xxxx.neonauth.c-2.us-east-2.aws.neon.build/neondb/auth
const NEON_AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? '';

if (!NEON_AUTH_URL && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] NEXT_PUBLIC_NEON_AUTH_URL is not set — sign-in will not work until it is configured.'
  );
}

const neonAuth = createInternalNeonAuth(NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

// The React client: signIn.email(), signIn.social({ provider: 'google' }),
// signUp.email(), signOut(), useSession() (React hook), getSession().
export const authClient = neonAuth.adapter;

// Returns a fresh, backend-verifiable JWT for the signed-in user (or null if signed out).
// Neon Auth access tokens are short-lived (~15 min), so call this right before each
// authenticated API request rather than caching it long-term.
export const getAccessToken = neonAuth.getJWTToken;

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface AuthSessionState {
  data: { user: AuthSessionUser } | null;
  isPending: boolean;
}

// NOTE: @neondatabase/auth's current beta type definitions declare `useSession` via an
// intersection that TypeScript can't call directly, even though it's implemented (and
// documented in the SDK's own source comments) as a plain React hook at runtime. This
// wrapper isolates the one necessary cast so the rest of the app stays fully typed.
export function useAuth(): AuthSessionState {
  const useSessionHook = authClient.useSession as unknown as () => AuthSessionState;
  return useSessionHook();
}
