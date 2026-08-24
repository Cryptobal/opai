import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { SupervisionClientReports } from "@/components/supervision/SupervisionClientReports";

export default async function SupervisionReportesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/reportes");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision") || !hasCapability(perms, "supervision_dashboard")) {
    redirect("/hub");
  }
  return <SupervisionClientReports />;
}
