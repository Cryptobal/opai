import { ForgotPasswordForm } from './ForgotPasswordForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Recuperar contraseña - OPAI',
  description: 'Solicita un enlace para restablecer tu contraseña',
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Recuperar contraseña</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
          </p>
        </div>

        <ForgotPasswordForm />

        <div className="text-center">
          <Link
            href="/opai/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al login
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          opai.gard.cl · Gard Security
        </p>
      </div>
    </div>
  );
}
