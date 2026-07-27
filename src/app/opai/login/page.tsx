/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop.
 * Si ya hay sesión activa, redirige a /hub (importante para PWA standalone).
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginPageClient } from './LoginPageClient';
import { Suspense } from 'react';
import LoginLoading from './loading';
import { resolvePostLoginPath } from '@/lib/landing-surface';
import { SURFACE_COOKIE, surfaceCookieOptions } from '@/lib/surface';

export const metadata: Metadata = {
  title: 'OPAI — Iniciar Sesión',
  description: 'Acceso al panel OPAI',
  robots: { index: false, follow: false },
};

export const viewport = {
  viewportFit: 'cover' as const,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = await searchParams;
  const portalParam = typeof params.portal === 'string' ? params.portal : undefined;

  // Only auto-redirect if session exists AND portal matches (or no specific portal requested)
  if (session?.user) {
    const sessionPortal = (session as any).portal as string | undefined;
    if (!portalParam || sessionPortal === portalParam || !sessionPortal) {
      const dest = await resolvePostLoginPath({
        adminId: session.user.id,
        role: session.user.role,
        roleTemplateId: session.user.roleTemplateId,
        tenantId: session.user.tenantId,
      });
      if (dest !== '/hub' && dest !== '/') {
        const jar = await cookies();
        jar.set(SURFACE_COOKIE, 'productividad', surfaceCookieOptions());
      }
      redirect(dest);
    }
    // Portal mismatch: user is logged in to a different portal.
    // Show the login form so they can authenticate for this portal.
  }

  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
