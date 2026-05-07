import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { ShieldCheck } from "lucide-react";
import { RondasDashboardClient } from "@/components/ops/rondas";

export default async function OpsRondasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="space-y-5 min-w-0">
      <PageHero
        icon={<ShieldCheck />}
        iconTone="emerald"
        title="Rondas de seguridad"
        subtitle="dashboard ejecutivo"
        description="Vista global de rondas e instalaciones con cumplimiento, alertas e incidentes consolidados."
      />
      <RondasDashboardClient />
    </div>
  );
}
