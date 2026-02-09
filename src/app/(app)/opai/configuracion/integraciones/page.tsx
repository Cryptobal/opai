import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { ConfigSubnav, IntegrationsGmailClient } from "@/components/opai";

export default async function IntegracionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
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
    <>
      <PageHeader
        title="Integraciones"
        description="Configura conexiones globales para el CRM"
        className="mb-6"
      />
      <ConfigSubnav />
      <div className="space-y-4">
        <IntegrationsGmailClient connected={Boolean(gmailAccount)} />
      </div>
    </>
  );
}
