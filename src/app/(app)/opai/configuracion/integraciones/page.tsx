import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { IntegrationsGmailClient } from "@/components/opai";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Plug } from "lucide-react";

export default async function IntegracionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;
  const gmailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });

  return (
    <ConfigPageLayout
      title="Integraciones"
      description="Configura conexiones globales para el CRM"
      icon={Plug}
    >
      <IntegrationsGmailClient connected={Boolean(gmailAccount)} />
    </ConfigPageLayout>
  );
}
