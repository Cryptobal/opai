/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop.
 *
 * Estática: la redirección de sesión activa vive en el middleware
 * (`src/proxy.ts` atajo de arranque). Así el HTML se sirve desde CDN
 * sin auth()+BD en el camino crítico del cold start nativo.
 */

import type { Metadata } from 'next';
import { LoginPageClient } from './LoginPageClient';
import { Suspense } from 'react';
import LoginLoading from './loading';

export const metadata: Metadata = {
  title: 'OPAI — Iniciar Sesión',
  description: 'Acceso al panel OPAI',
  robots: { index: false, follow: false },
};

export const viewport = {
  viewportFit: 'cover' as const,
};

export const dynamic = 'force-static';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
