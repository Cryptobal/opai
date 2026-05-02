import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Receipt } from "lucide-react";
import { RendicionForm } from "@/components/finance/RendicionForm";

export default async function NuevaRendicionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/rendiciones/nueva");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!hasCapability(perms, "rendicion_submit")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;

  const [items, costCenters, config] = await Promise.all([
    prisma.financeRendicionItem.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, code: true, category: true },
      orderBy: { name: "asc" },
    }),
    // Cargar centros de costo activos (incluye los de instalaciones y manuales)
    prisma.financeCostCenter.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, code: true, installationId: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeRendicionConfig.findUnique({
      where: { tenantId },
      select: {
        kmPerLiter: true,
        fuelPricePerLiter: true,
        vehicleFeePct: true,
        requireImage: true,
        requireObservations: true,
        requireTollImage: true,
      },
    }),
  ]);

  const costCenterOptions = costCenters.map((cc) => ({
    id: cc.id,
    name: cc.name,
    code: cc.code,
    isFromInstallation: cc.installationId !== null,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Receipt />}
        iconTone="teal"
        eyebrow={["Finanzas", "Rendiciones", "Nueva"]}
        title="Nueva rendición"
        subtitle="registro de gastos"
        description="Crea una nueva rendición de gastos o kilometraje."
      />
      <RendicionForm
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          code: i.code,
          category: i.category,
        }))}
        costCenters={costCenterOptions}
        config={
          config
            ? {
                kmPerLiter: Number(config.kmPerLiter),
                fuelPricePerLiter: config.fuelPricePerLiter,
                vehicleFeePct: Number(config.vehicleFeePct),
                requireImage: config.requireImage,
                requireObservations: config.requireObservations,
                requireTollImage: config.requireTollImage,
              }
            : null
        }
      />
    </div>
  );
}
