/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop
 */

import { LoginPageClient } from './LoginPageClient';

export const metadata = {
  title: 'Iniciar sesión - OPAI',
  description: 'Acceso al panel OPAI',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || '/hub';
  const error = params.error;
  const success = params.success;

  return <LoginPageClient callbackUrl={callbackUrl} error={error} success={success} />;
}
