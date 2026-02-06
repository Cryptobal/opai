/**
 * Gestión de Usuarios
 * 
 * Página para administrar usuarios y permisos del equipo.
 * Usa OPAI Design System - Sin topbar redundante.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { hasPermission, PERMISSIONS, type Role } from '@/lib/rbac';
import { listUsers, listPendingInvitations } from '@/app/(app)/opai/actions/users';
import { PageHeader } from '@/components/opai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UsersTable from '@/components/usuarios/UsersTable';
import InvitationsTable from '@/components/usuarios/InvitationsTable';
import InviteUserButton from '@/components/usuarios/InviteUserButton';
import RolesHelpCard from '@/components/usuarios/RolesHelpCard';

export default async function UsuariosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/opai/login');
  }

  const canManageUsers = hasPermission(
    session.user.role as Role,
    PERMISSIONS.MANAGE_USERS
  );

  if (!canManageUsers) {
    redirect('/opai/inicio');
  }

  const usersResult = await listUsers();
  const invitationsResult = await listPendingInvitations();

  const users = usersResult.success && usersResult.users ? usersResult.users : [];
  const invitations = invitationsResult.success && invitationsResult.invitations ? invitationsResult.invitations : [];

  return (
    <>
      {/* Page Header - OPAI Design System */}
      <PageHeader
        title="Gestión de Usuarios"
        description="Administra los usuarios y permisos de tu equipo"
        actions={
          <div className="flex items-center gap-3">
            <RolesHelpCard />
            <InviteUserButton />
          </div>
        }
      />

      <div className="space-y-8">
        {/* Usuarios activos */}
        <Card>
          <CardHeader>
            <CardTitle>Usuarios Activos</CardTitle>
            <CardDescription>
              {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <UsersTable users={users} currentUserId={session.user.id} currentUserRole={session.user.role} />
          </CardContent>
          <CardContent className="border-t border-border bg-muted/20">
            <p className="text-sm font-medium mb-2">💡 Cómo gestionar usuarios:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Columna ROL:</strong> Click en el rol de otro usuario para cambiarlo (Visualizador, Editor, Admin, Propietario). Tu propio rol no es editable.</li>
              <li><strong>Columna ACCIONES:</strong> En tu fila aparece &quot;(Tú)&quot;. Para otros usuarios hay un menú (⋮) para activar/desactivar.</li>
              <li><strong>Permisos:</strong> Al cambiar el rol, los permisos se actualizan automáticamente. Click en &quot;Ver permisos&quot; arriba para ver la matriz completa.</li>
            </ul>
          </CardContent>
        </Card>

        {/* Invitaciones pendientes */}
        {invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Invitaciones Pendientes</CardTitle>
              <CardDescription>
                {invitations.length}{' '}
                {invitations.length === 1 ? 'invitación' : 'invitaciones'}{' '}
                esperando aceptación
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <InvitationsTable invitations={invitations} />
            </CardContent>
            <CardContent className="border-t border-border">
              <p className="text-xs text-muted-foreground">
                En <strong>Acciones</strong> puedes revocar una invitación para que el enlace deje de ser válido.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
