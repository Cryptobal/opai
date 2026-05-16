import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/opai-ds";
import { Lock } from "lucide-react";
import Link from "next/link";
import {
  computeWeeklyCloseSnapshot,
  nextWeekClosingDate,
  listRecentCloses,
} from "@/modules/finance/cashflow/weekly-close.service";
import { WeeklyCloseClient } from "@/components/finance/cashflow/WeeklyCloseClient";

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ weekEnd?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/cierre");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  const canManage = hasCapability(perms, "cashflow_manage");

  const tenantId = session.user.tenantId;
  const sp = await searchParams;
  const weekEnd = sp.weekEnd ? new Date(sp.weekEnd) : await nextWeekClosingDate(tenantId);
  const snapshot = await computeWeeklyCloseSnapshot(tenantId, weekEnd);
  const history = await listRecentCloses(tenantId, 8);

  return (
    <div className="space-y-3 sm:space-y-5 min-w-0">
      <PageHero
        icon={<Lock />}
        iconTone="teal"
        title="Cierre semanal"
        subtitle="snapshot soft del viernes"
        description="No bloquea ediciones retroactivas. Solo congela 'esto fue lo que se veía al cierre del viernes EOD' para auditoría histórica."
      />
      <div className="px-4 py-3 bg-status-info-soft border border-status-info-border rounded-md text-sm text-status-info-fg">
        <strong>Esta vista pasó a ser solo de auditoría.</strong> Para cerrar
        la semana y anclar la proyección al saldo banco real, usa el botón
        "Cerrar semana" en la celda del bucket actual de{" "}
        <Link href="/finanzas/flujo-caja" className="underline">
          la grilla principal
        </Link>
        .
      </div>
      <WeeklyCloseClient
        initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
        initialHistory={JSON.parse(JSON.stringify(history))}
        canManage={canManage}
      />
    </div>
  );
}
