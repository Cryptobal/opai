'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authenticate } from './actions';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

interface LoginPageClientProps {
  callbackUrl?: string;
  error?: string;
  success?: string;
}

export function LoginPageClient({ callbackUrl: callbackUrlProp, error: errorProp, success: successProp }: LoginPageClientProps) {
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = callbackUrlProp ?? searchParams.get('callbackUrl') ?? '/hub';
  const error = errorProp ?? searchParams.get('error') ?? undefined;
  const success = successProp ?? searchParams.get('success') ?? undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Image
            src="/icons/icon-96x96.png"
            alt="OPAI"
            width={64}
            height={64}
            className="mx-auto h-16 w-16 object-contain"
            priority
          />
          <h1 className="text-2xl font-bold text-foreground mt-3">OPAI</h1>
          <p className="text-muted-foreground mt-1 text-sm">Iniciar sesión</p>
        </div>
        <form action={authenticate} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {success && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
              <p className="text-sm text-primary">
                {success === 'password-reset' && 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.'}
                {success === 'account-activated' && 'Cuenta activada correctamente. Ya puedes iniciar sesión.'}
              </p>
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              placeholder="admin@gard.cl"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">Contraseña</label>
              <Link href="/opai/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
              <p className="text-sm text-red-400">
                {error === 'CredentialsSignin' ? 'Email o contraseña incorrectos.' : 'Error al iniciar sesión.'}
              </p>
            </div>
          )}
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Entrar
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground">opai.gard.cl · Gard Security</p>
      </div>
    </div>
  );
}
