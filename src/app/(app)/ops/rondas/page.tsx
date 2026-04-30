import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai-ds";
import { RondasDashboardClient } from "@/components/ops/rondas";
import { RondasSubnav } from "@/components/ops/RondasSubnav";

export default async function OpsRondasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        title="Rondas de seguridad"
        description="Dashboard ejecutivo de rondas e instalaciones."
      />
      <RondasSubnav />
      <RondasDashboardClient />
    </div>
  );
}
