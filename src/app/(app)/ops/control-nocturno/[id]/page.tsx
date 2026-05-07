import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { OpsControlNocturnoDetailClient } from "@/components/ops/OpsControlNocturnoDetailClient";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { Info, Moon } from "lucide-react";
type Props = { params: Promise<{ id: string }> };

export default async function OpsControlNocturnoDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/control-nocturno");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "control_nocturno")) {
    redirect("/hub");
  }

  const { id } = await params;

  return (
    <div className="space-y-6 min-w-0">
      <div className="rounded-lg border border-status-info-border bg-status-info-soft p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-status-info-fg mt-0.5 shrink-0" />
          <div className="text-sm sm:text-base text-status-info-fg">
            <p className="font-medium">Este módulo fue integrado al Monitor de Rondas.</p>
            <p className="mt-1">
              Los reportes nuevos se generan desde el Monitor.{" "}
              <Link href="/ops/rondas/monitoreo" className="font-medium underline underline-offset-2 hover:brightness-110">
                Ir al Monitor de Rondas &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
      <PageHero
        icon={<Moon />}
        iconTone="emerald"
        title="Reporte nocturno"
        subtitle="histórico de control de guardia"
        description="Detalle del control de guardia nocturna. Este módulo fue integrado al Monitor de Rondas."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsControlNocturnoDetailClient reporteId={id} userRole={session.user.role} />
    </div>
  );
}
