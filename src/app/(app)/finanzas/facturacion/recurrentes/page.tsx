import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Repeat } from "lucide-react";
import { RecurringClient } from "@/components/finance/RecurringClient";

export default async function RecurrentesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/recurrentes");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;
  const canManage =
    hasFacturacionCapability(perms, "facturacion_issue") ||
    hasFacturacionCapability(perms, "facturacion_create_draft");

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId },
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }],
  });

  const initial = templates.map((t) => ({
    id: t.id,
    name: t.name,
    isActive: t.isActive,
    dteType: t.dteType,
    receiverName: t.receiverName,
    receiverRut: t.receiverRut,
    currency: t.currency,
    frequency: t.frequency,
    dayOfMonth: t.dayOfMonth,
    dayOfWeek: t.dayOfWeek,
    monthOfYear: t.monthOfYear,
    startDate: t.startDate.toISOString().split("T")[0],
    endDate: t.endDate ? t.endDate.toISOString().split("T")[0] : null,
    nextRunAt: t.nextRunAt ? t.nextRunAt.toISOString().split("T")[0] : null,
    lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
    runCount: t.runCount,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Repeat />}
        title="Facturación recurrente"
        description="Plantillas que generan borradores automáticamente. El cron NO emite directo al SII — siempre revisas el borrador antes de emitir."
      />
      <RecurringClient initialTemplates={initial} canManage={canManage} />
    </div>
  );
}
