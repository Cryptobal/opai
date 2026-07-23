import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
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

  const tenantId = session.user.tenantId;

  return (
    <div className="min-w-0 overflow-x-hidden">
      <OnboardingDashboardClient
        tenantId={tenantId}
        userRole={session.user.role}
      />
    </div>
  );
}
