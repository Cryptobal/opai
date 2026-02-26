import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader, IntegrationsGmailClient } from "@/components/opai";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function IntegracionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const gmailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Integraciones"
        description="Configura conexiones globales para el CRM"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <IntegrationsGmailClient connected={Boolean(gmailAccount)} />
    </div>
  );
}
