/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop - no requiere layout con auth
 * Redirige a /opai/inicio tras login exitoso
 */

import { LoginForm } from './LoginForm';

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">OPAI</h1>
          <p className="text-muted-foreground mt-1 text-sm">Iniciar sesión</p>
        </div>
        <LoginForm callbackUrl={callbackUrl} error={error} success={success} />
        <p className="text-center text-xs text-muted-foreground">
          opai.gard.cl · Gard Security
        </p>
      </div>
    </div>
  );
}
