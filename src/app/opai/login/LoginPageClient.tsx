'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { authenticate } from './actions';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormHeader } from '@/components/auth/AuthFormHeader';
import { AuthTextInput } from '@/components/auth/AuthTextInput';
import { AuthButton } from '@/components/auth/AuthButton';
import { UserIcon, LockIcon } from '@/components/auth/icons';

interface LoginPageClientProps {
  callbackUrl?: string;
  error?: string;
  success?: string;
}

const ACCENT = "#f43f5e";

export function LoginPageClient({ callbackUrl: callbackUrlProp, error: errorProp, success: successProp }: LoginPageClientProps) {
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = callbackUrlProp ?? searchParams.get('callbackUrl') ?? '/hub';
  const portal = searchParams.get('portal') ?? '';
  const error = errorProp ?? searchParams.get('error') ?? undefined;
  const success = successProp ?? searchParams.get('success') ?? undefined;

  return (
    <AuthShell
      portalId="opai"
      accent={ACCENT}
      accentRgb="244, 63, 94"
      portalName="OPAI"
      portalSubtitle="Sistema ERP Completo"
    >
      <AuthFormHeader title="Acceso al ERP" subtitle="Panel de gesti&oacute;n integral" />

      <form action={authenticate}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="portal" value={portal} />

        {success && (
          <div
            className="rounded-xl px-4 py-3 mb-4"
            style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}20` }}
          >
            <p className="text-sm" style={{ color: ACCENT }}>
              {success === 'password-reset' && 'Contrase\u00f1a actualizada correctamente. Ya puedes iniciar sesi\u00f3n.'}
              {success === 'account-activated' && 'Cuenta activada correctamente. Ya puedes iniciar sesi\u00f3n.'}
            </p>
          </div>
        )}

        <AuthTextInput
          label="Usuario o correo"
          accent={ACCENT}
          icon={<UserIcon />}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@empresa.cl"
        />

        <div className="mb-4">
          <div className="flex items-center justify-between mb-[7px]">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[#9ca3af]"
              style={{ letterSpacing: "0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Contrase&ntilde;a
            </label>
            <Link
              href="/opai/forgot-password"
              className="text-xs font-medium cursor-pointer transition-colors"
              style={{ color: ACCENT }}
            >
              Recuperar clave
            </Link>
          </div>
          <div className="relative">
            <div
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4b5563]"
            >
              <LockIcon />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="w-full rounded-xl bg-white/[0.03] text-[#f9fafb] text-sm outline-none transition-all duration-300"
              style={{
                padding: "12px 42px 12px 42px",
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-[#9ca3af] transition-colors"
              aria-label={showPassword ? 'Ocultar contrase\u00f1a' : 'Mostrar contrase\u00f1a'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <p className="text-sm text-status-danger-fg">
              {error === 'CredentialsSignin'
                ? 'Email o contrase\u00f1a incorrectos.'
                : error === 'google_not_registered'
                ? 'Tu cuenta de Google no est\u00e1 registrada como administrador.'
                : 'Error al iniciar sesi\u00f3n.'}
            </p>
          </div>
        )}

        <AuthButton accent={ACCENT} label="Ingresar al ERP" type="submit" />
      </form>

      {/* Separator */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#0f1729] px-2 text-[#6b7280]">o</span>
        </div>
      </div>

      {/* Google Sign-In */}
      <button
        onClick={() => signIn('google', { callbackUrl: callbackUrl })}
        type="button"
        className="w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-colors cursor-pointer"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          color: "#d1d5db",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continuar con Google
      </button>
    </AuthShell>
  );
}
