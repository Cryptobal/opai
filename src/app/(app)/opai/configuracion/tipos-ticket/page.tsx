import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { ConfigBackLink } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { TicketTypesConfigClient } from "@/components/config/TicketTypesConfigClient";

export default async function TiposTicketConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <ConfigBackLink />
      <PageHeader
        title="Tipos de Ticket"
        description="Define tipos de solicitud (vacaciones, desvinculaciones, etc.), su origen y cadena de aprobación"
      />
      <TicketTypesConfigClient userRole={role} />
    </div>
  );
}
