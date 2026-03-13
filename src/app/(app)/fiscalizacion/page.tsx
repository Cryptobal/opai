import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { FiscalizacionDashboard } from "./FiscalizacionDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fiscalización DT — OPAI Suite",
};

export default async function FiscalizacionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const perms = await resolvePermissions({
    role: session.user.role,
    roleTemplateId: session.user.roleTemplateId,
  });

  if (!canView(perms, "fiscalizacion") && !["owner", "admin"].includes(session.user.role)) {
    redirect("/hub");
  }

  return (
    <FiscalizacionDashboard
      userRole={session.user.role}
      userName={session.user.name}
      tenantId={session.user.tenantId}
    />
  );
}
