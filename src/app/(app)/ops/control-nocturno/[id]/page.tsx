import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { OpsControlNocturnoDetailClient } from "@/components/ops/OpsControlNocturnoDetailClient";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { Info } from "lucide-react";
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
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm sm:text-base text-blue-800 dark:text-blue-200">
            <p className="font-medium">Este módulo fue integrado al Monitor de Rondas.</p>
            <p className="mt-1">
              Los reportes nuevos se generan desde el Monitor.{" "}
              <Link href="/ops/rondas/monitoreo" className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100">
                Ir al Monitor de Rondas &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
      <PageHeader
        title="Reporte nocturno"
        description="Detalle del control de guardia nocturna."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsControlNocturnoDetailClient reporteId={id} userRole={session.user.role} />
    </div>
  );
}
