import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { ComplianceConfigClient } from "@/components/configuracion/ComplianceConfigClient";
import { Shield } from "lucide-react";

export default async function CumplimientoConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/cumplimiento");

  const role = session.user.role;
  if (!["owner", "admin"].includes(role)) redirect("/opai/configuracion");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: {
      dpoContactEmail: true,
      dpaAcceptedAt: true,
      dpaAcceptedBy: true,
      dpaVersion: true,
    },
  });

  return (
    <ConfigPageLayout
      title="Cumplimiento"
      description="Ley 21.719 de Protección de Datos Personales. Contacto del DPO y estado del DPA."
      icon={<Shield className="h-[18px] w-[18px]" />}
    >
      <ComplianceConfigClient
        initialDpoContactEmail={tenant?.dpoContactEmail ?? null}
        dpaAcceptedAt={tenant?.dpaAcceptedAt?.toISOString() ?? null}
        dpaAcceptedBy={tenant?.dpaAcceptedBy ?? null}
        dpaVersion={tenant?.dpaVersion ?? null}
      />
    </ConfigPageLayout>
  );
}
