import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { SignatureManagerClient } from "@/components/crm/SignatureManagerClient";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function FirmasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/firmas");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "firmas")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const signatures = await prisma.crmEmailSignature.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const initialSignatures = JSON.parse(JSON.stringify(signatures));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Firmas de email"
        description="Gestiona las firmas que se incluyen al final de los correos enviados desde el CRM"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <SignatureManagerClient initialSignatures={initialSignatures} />
    </div>
  );
}
