import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { FiscalizacionDtConfigClient } from "@/components/configuracion/FiscalizacionDtConfigClient";
import { Shield } from "lucide-react";

export default async function FiscalizacionDtConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/fiscalizacion-dt");
  if (!["owner", "admin"].includes(session.user.role)) redirect("/opai/configuracion");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { dtNoticeEmail: true, dtDailyReportEmail: true },
  });

  return (
    <ConfigPageLayout
      title="Fiscalización DT"
      description="Correo de aviso al inspector y destinatario del reporte diario de asistencia."
      icon={<Shield className="h-[18px] w-[18px]" />}
    >
      <FiscalizacionDtConfigClient
        initialNoticeEmail={tenant?.dtNoticeEmail ?? null}
        initialDailyEmail={tenant?.dtDailyReportEmail ?? null}
      />
    </ConfigPageLayout>
  );
}
