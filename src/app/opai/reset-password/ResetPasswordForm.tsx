'use client';

import { useState } from 'react';
import { resetPassword } from '../forgot-password/actions';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ResetPasswordFormProps {
  token: string;
  email: string;
}

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 transition-colors";

export function ResetPasswordForm({ token, email }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(email, token, password);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/opai/login?success=password-reset');
        }, 2000);
      } else {
        setError(result.error || 'Error al restablecer contraseña');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error al restablecer contraseña. Por favor, intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-lg bg-primary/10 border border-primary/20 p-6 space-y-3">
        <div className="flex items-center gap-3 text-primary">
          <CheckCircle className="h-5 w-5" />
          <h3 className="text-sm font-semibold">Contraseña actualizada</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Tu contraseña ha sido restablecida correctamente. Redirigiendo al login...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-muted border border-border p-3">
        <p className="text-xs text-muted-foreground">
          Restablecer contraseña para: <span className="text-primary font-medium">{email}</span>
        </p>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
          Nueva contraseña
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={isLoading}
            className={`${inputClass} pl-10 pr-10`}
            placeholder="Mínimo 8 caracteres"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1.5">
          Confirmar contraseña
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={isLoading}
            className={`${inputClass} pl-10 pr-10`}
            placeholder="Repite tu contraseña"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Actualizando...' : 'Restablecer contraseña'}
      </button>

      <div className="text-center pt-2">
        <Link
          href="/opai/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Volver al login
        </Link>
      </div>
    </form>
  );
}
