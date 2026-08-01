/**
 * Página de perfil de usuario
 * Permite cambiar contraseña y ver información de la cuenta
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ChangePasswordForm } from '@/components/perfil/ChangePasswordForm';
import { UserInfo } from '@/components/perfil/UserInfo';

export const metadata = {
  title: 'Mi Perfil - OPAI',
  description: 'Gestiona tu cuenta y configuración',
};

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user) redirect('/opai/login?callbackUrl=/opai/perfil');

  const dbUser = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      cargo: true,
      phone: true,
      photoUrl: true,
    },
  });

  const userData = {
    name: dbUser?.name ?? session.user.name,
    email: dbUser?.email ?? session.user.email,
    role: dbUser?.role ?? session.user.role,
    cargo: dbUser?.cargo ?? null,
    phone: dbUser?.phone ?? null,
    photoUrl: dbUser?.photoUrl ?? null,
  };

  return (
    <div className="min-w-0">
      <div className="max-w-2xl mx-auto space-y-6">
        <UserInfo user={userData} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
