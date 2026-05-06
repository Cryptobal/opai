import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { TicketTypesConfigTabs } from "@/components/config/TicketTypesConfigTabs";
import { Ticket } from "lucide-react";

export default async function TiposTicketConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/tipos-ticket");

  const role = session.user.role;
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "tipos_ticket")) {
    redirect("/opai/configuracion");
  }

  const admins = await prisma.admin.findMany({
    where: { tenantId: session.user.tenantId, status: "active" },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <ConfigPageLayout
      title="Tipos de Ticket"
      description="Define tipos de solicitud (vacaciones, desvinculaciones, etc.), su origen y cadena de aprobación"
      icon={<Ticket className="h-[18px] w-[18px]" />}
    >
      <TicketTypesConfigTabs userRole={role} admins={admins} />
    </ConfigPageLayout>
  );
}
