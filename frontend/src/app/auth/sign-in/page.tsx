'use client';

import { AuthView } from '@neondatabase/auth-ui';

export default function SignInPage() {
  return (
    <div className="max-w-sm mx-auto py-8">
      <h1 className="text-xl font-bold text-library text-center mb-6">
        Sign in to One World Sentence
      </h1>
      <AuthView pathname="sign-in" />
    </div>
  );
}
