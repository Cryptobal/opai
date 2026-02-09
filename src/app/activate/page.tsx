'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { activateAccount } from '@/app/(app)/opai/actions/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';

function ActivateForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Token de invitación no válido');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);

    const result = await activateAccount(token, name, password);

    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push('/opai/login?success=account-activated');
      }, 2000);
    } else {
      setError(result.error || 'Error al activar la cuenta');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              Token Inválido
            </CardTitle>
            <CardDescription className="text-slate-400">
              El enlace de activación no es válido o ha expirado.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              Cuenta Activada
            </CardTitle>
            <CardDescription className="text-slate-400">
              Tu cuenta ha sido activada exitosamente. Redirigiendo al login...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader>
          <CardTitle className="text-white">Activa tu cuenta</CardTitle>
          <CardDescription className="text-slate-400">
            Completa tu perfil y define tu contraseña para comenzar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-slate-300">Nombre completo</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
                className="bg-background border-input text-foreground placeholder:text-muted-foreground mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="bg-background border-input text-foreground placeholder:text-muted-foreground mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-slate-300">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                required
                className="bg-background border-input text-foreground placeholder:text-muted-foreground mt-1.5"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 p-3 rounded flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full " 
              disabled={loading}
            >
              {loading ? 'Activando cuenta...' : 'Activar cuenta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-white">Cargando...</div>
      </div>
    }>
      <ActivateForm />
    </Suspense>
  );
}
