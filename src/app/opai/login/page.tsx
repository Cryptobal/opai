/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop.
 * Si ya hay sesión activa, redirige a /hub (importante para PWA standalone).
 */

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginPageClient } from './LoginPageClient';
import { Suspense } from 'react';
import LoginLoading from './loading';

export const metadata = {
  title: 'OPAI — Iniciar Sesión',
  description: 'Acceso al panel OPAI',
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
      redirect('/hub');
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
