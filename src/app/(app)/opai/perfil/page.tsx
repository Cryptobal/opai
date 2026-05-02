/**
 * Página de perfil de usuario
 * Permite cambiar contraseña y ver información de la cuenta
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/opai-ds';
import { UserCircle2 } from 'lucide-react';
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
    select: { name: true, email: true, role: true, cargo: true, phone: true },
  });

  const userData = {
    name: dbUser?.name ?? session.user.name,
    email: dbUser?.email ?? session.user.email,
    role: dbUser?.role ?? session.user.role,
    cargo: dbUser?.cargo ?? null,
    phone: dbUser?.phone ?? null,
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<UserCircle2 />}
        iconTone="primary"
        eyebrow={["Mi Perfil"]}
        title="Mi Perfil"
        subtitle="cuenta y configuración"
        description="Gestiona tu cuenta y configuración."
      />

      <div className="max-w-2xl mx-auto space-y-6">
        <UserInfo user={userData} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
