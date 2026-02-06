'use server';

/**
 * Server Actions para Login
 */

import { signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

export async function authenticate(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const callbackUrl = String(formData.get('callbackUrl') ?? '/opai/inicio');

  try {
    await signIn('credentials', {
      email,
      password,
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
