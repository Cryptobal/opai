'use client';

import { useState } from 'react';
import { requestPasswordReset } from './actions';
import { Mail, CheckCircle } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await requestPasswordReset(email);
      setSuccess(true);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-lg bg-primary/10 border border-primary/20 p-6 space-y-3">
        <div className="flex items-center gap-3 text-primary">
          <CheckCircle className="h-5 w-5" />
          <h3 className="text-sm font-semibold">Correo enviado</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Si existe una cuenta con el email <strong className="text-foreground">{email}</strong>, recibirás un correo con las instrucciones para restablecer tu contraseña.
        </p>
        <p className="text-xs text-muted-foreground">
          Revisa tu bandeja de entrada y la carpeta de spam. El enlace expirará en 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={isLoading}
            className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 transition-colors"
            placeholder="admin@gard.cl"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
      </button>
    </form>
  );
}
