import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { LayoutGrid } from "lucide-react";
import { SupervisionGrilla } from "@/components/supervision/SupervisionGrilla";
export default async function OpsSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;

  return (
    <div className="space-y-4 min-w-0">
      <PageHero
        icon={<LayoutGrid />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Supervisión"]}
        title="Grilla de supervisión"
        subtitle="visitas por instalación y día"
        description="Vista calendario de visitas de supervisión por instalación, con filtros mensuales y atajos para crear nuevas visitas."
      />
      <SupervisionGrilla year={year} month={month} />
    </div>
  );
}
