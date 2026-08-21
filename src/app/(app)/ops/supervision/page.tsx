import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { SupervisionGrilla } from "@/components/supervision/SupervisionGrilla";
import { IncidentesSupervisionCard } from "@/components/supervision/IncidentesSupervisionCard";
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
    <div className="min-w-0 space-y-4">
      <IncidentesSupervisionCard />
      <SupervisionGrilla year={year} month={month} />
    </div>
  );
}
