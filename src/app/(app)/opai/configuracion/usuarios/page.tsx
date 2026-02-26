/**
 * Gestión de Usuarios (Configuración)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listUsers, listPendingInvitations, listRoleTemplates } from "@/app/(app)/opai/actions/users";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import UsersTable from "@/components/usuarios/UsersTable";
import InvitationsTable from "@/components/usuarios/InvitationsTable";
import InviteUserButton from "@/components/usuarios/InviteUserButton";
import RolesHelpCard from "@/components/usuarios/RolesHelpCard";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";

export default async function UsuariosConfigPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/opai/login");
  }

  const perms = await resolvePagePerms(session.user);

  if (!canView(perms, "config", "usuarios") || !hasCapability(perms, "manage_users")) {
    redirect("/opai/inicio");
  }

  const [usersResult, invitationsResult, templatesResult] = await Promise.all([
    listUsers(),
    listPendingInvitations(),
    listRoleTemplates(),
  ]);

  const users = usersResult.success && usersResult.users ? usersResult.users : [];
  const invitations =
    invitationsResult.success && invitationsResult.invitations
      ? invitationsResult.invitations
      : [];
  const roleTemplates = templatesResult.success && templatesResult.templates ? templatesResult.templates : [];

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Gestión de Usuarios"
        description="Administra los usuarios y permisos de tu equipo"
        backHref="/opai/configuracion"
        backLabel="Configuración"
        actions={
          <div className="flex items-center gap-3">
            <RolesHelpCard />
            <InviteUserButton roleTemplates={roleTemplates} />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Usuarios Activos</CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? "usuario" : "usuarios"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <UsersTable
            users={users}
            roleTemplates={roleTemplates}
            currentUserId={session.user.id}
            currentUserRole={session.user.role}
          />
        </CardContent>
        <CardContent className="border-t border-border">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Rol:</strong> haz clic en el rol para cambiarlo.{" "}
            <strong className="text-foreground">Acciones:</strong> menú (⋮) para activar/desactivar.{" "}
            <strong className="text-foreground">Permisos:</strong> usa &quot;Ver permisos&quot; arriba.
          </p>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones Pendientes</CardTitle>
            <CardDescription>
              {invitations.length}{" "}
              {invitations.length === 1 ? "invitación" : "invitaciones"}{" "}
              esperando aceptación
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <InvitationsTable invitations={invitations} />
          </CardContent>
          <CardContent className="border-t border-border">
            <p className="text-xs text-muted-foreground">
              En <strong className="text-foreground">Acciones</strong> puedes revocar una invitación para invalidar el enlace.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
