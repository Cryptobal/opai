/**
 * Página de login - Auth.js v5 Credentials
 * Fuera de (app) para evitar redirect loop.
 * No await searchParams para que el HTML se envíe de inmediato; el cliente lee la URL.
 */

import { LoginPageClient } from './LoginPageClient';
import { Suspense } from 'react';
import LoginLoading from './loading';

export const metadata = {
  title: 'Iniciar sesión - OPAI',
  description: 'Acceso al panel OPAI',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
