import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { prisma } from "@/lib/prisma";
import { SignatureManagerClient } from "@/components/crm/SignatureManagerClient";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PenLine } from "lucide-react";

export default async function FirmasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/firmas");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "firmas")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;

  const signatures = await prisma.crmEmailSignature.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const initialSignatures = JSON.parse(JSON.stringify(signatures));

  return (
    <ConfigPageLayout
      title="Firmas"
      description="Gestiona las firmas que se incluyen al final de los correos enviados desde el CRM"
      icon={<PenLine className="h-[18px] w-[18px]" />}
    >
      <SignatureManagerClient initialSignatures={initialSignatures} />
    </ConfigPageLayout>
  );
}
