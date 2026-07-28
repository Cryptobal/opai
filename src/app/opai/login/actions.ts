'use server';

/**
 * Server Actions para Login
 */

import { cookies } from 'next/headers';
import { signIn, auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { resolvePostLoginPath } from '@/lib/landing-surface';
import { SURFACE_COOKIE, surfaceCookieOptions } from '@/lib/surface';

export async function authenticate(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const callbackUrl = String(formData.get('callbackUrl') ?? '/hub');
  const portal = String(formData.get('portal') ?? 'opai') || 'opai';

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

  const session = await auth();
  if (session?.user) {
    const dest = await resolvePostLoginPath({
      adminId: session.user.id,
      role: session.user.role,
      roleTemplateId: session.user.roleTemplateId,
      tenantId: session.user.tenantId,
      callbackUrl,
    });
    if (
      dest.startsWith('/crm/correos') ||
      dest.startsWith('/opai/tareas') ||
      dest.startsWith('/opai/agenda') ||
      dest.startsWith('/productividad')
    ) {
      const jar = await cookies();
      jar.set(SURFACE_COOKIE, 'productividad', surfaceCookieOptions());
    }
    redirect(dest);
  }

  redirect(callbackUrl);
}
