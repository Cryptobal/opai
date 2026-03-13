import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { OnboardingDashboardClient } from "@/components/ops/OnboardingDashboardClient";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/onboarding");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        title="Onboarding"
        description="Estado de onboarding de guardias — emails enviados, acceso a portales y progreso."
      />
      <OnboardingDashboardClient
        tenantId={tenantId}
        userRole={session.user.role}
      />
    </div>
  );
}
