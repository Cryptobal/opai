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

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/hub');

  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
