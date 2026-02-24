import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
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

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [items, installations, config] = await Promise.all([
    prisma.financeRendicionItem.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, code: true, category: true },
      orderBy: { name: "asc" },
    }),
    // Cargar instalaciones activas con su cliente (activo por isActive o status)
    prisma.crmInstallation.findMany({
      where: {
        tenantId,
        isActive: true,
        account: {
          OR: [
            { isActive: true },
            { status: "client_active" },
          ],
        },
      },
      select: {
        id: true,
        name: true,
        address: true,
        account: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ account: { name: "asc" } }, { name: "asc" }],
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

  // Agrupar instalaciones por cliente para el selector
  const installationOptions = installations.map((inst) => ({
    id: inst.id,
    name: inst.name,
    address: inst.address,
    accountId: inst.account?.id ?? null,
    accountName: inst.account?.name ?? "Sin cliente",
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Nueva rendición"
        description="Crea una nueva rendición de gastos o kilometraje."
      />
      <RendicionForm
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          code: i.code,
          category: i.category,
        }))}
        installations={installationOptions}
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
