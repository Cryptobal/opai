'use server';

/**
 * Server Actions para Login
 */

import { signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

/** Determine portal context from callbackUrl */
function portalFromCallback(callbackUrl: string): string {
  if (callbackUrl.startsWith('/portal/supervisor')) return 'supervisor';
  return 'opai';
}

export async function authenticate(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const callbackUrl = String(formData.get('callbackUrl') ?? '/hub');
  const portalParam = String(formData.get('portal') ?? '');
  const portal = portalParam || portalFromCallback(callbackUrl);

  try {
    await signIn('credentials', {
      email,
      password,
      portal,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return redirect('/opai/login?error=CredentialsSignin');
    }
    throw error;
  }

  redirect(callbackUrl);
}
