import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { TicketTypesConfigTabs } from "@/components/config/TicketTypesConfigTabs";
import { Ticket } from "lucide-react";

export default async function TiposTicketConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Tipos de Ticket"
      description="Define tipos de solicitud (vacaciones, desvinculaciones, etc.), su origen y cadena de aprobación"
      icon={Ticket}
    >
      <TicketTypesConfigTabs userRole={role} />
    </ConfigPageLayout>
  );
}
