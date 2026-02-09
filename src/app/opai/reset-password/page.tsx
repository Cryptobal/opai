import { ResetPasswordForm } from './ResetPasswordForm';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Restablecer contraseña - OPAI',
  description: 'Crea una nueva contraseña para tu cuenta',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const params = await searchParams;
  const { token, email } = params;

  // Si no hay token o email, redirigir a forgot-password
  if (!token || !email) {
    redirect('/opai/forgot-password');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Nueva contraseña</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Crea una nueva contraseña segura para tu cuenta
          </p>
        </div>

        <ResetPasswordForm token={token} email={decodeURIComponent(email)} />

        <p className="text-center text-xs text-muted-foreground">
          opai.gard.cl · Gard Security
        </p>
      </div>
    </div>
  );
}
