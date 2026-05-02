import { redirect } from "next/navigation";
import { PageHero } from "@/components/opai-ds";
import { Clock } from "lucide-react";
import { JornadaDiariaClient } from "@/components/reportes-dt/JornadaDiariaClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export default async function JornadaDiariaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const tenantId = session.user.tenantId;
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHero
        icon={<Clock />}
        iconTone="teal"
        eyebrow={["Reportes", "DT", "Jornada Diaria"]}
        title="Jornada Diaria"
        subtitle="Res. N°38 Art. 6 — horas normales y extras"
        description="Res. Exenta N°38 Art. 6 — Horas normales y extraordinarias por trabajador"
      />
      <JornadaDiariaClient installations={installations} />
    </div>
  );
}
