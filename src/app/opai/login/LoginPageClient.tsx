'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
            <p className="text-sm text-red-400">
              {error === 'CredentialsSignin' ? 'Email o contrase\u00f1a incorrectos.' : 'Error al iniciar sesi\u00f3n.'}
            </p>
          </div>
        )}

        <AuthButton accent={ACCENT} label="Ingresar al ERP" type="submit" />
      </form>
    </AuthShell>
  );
}
