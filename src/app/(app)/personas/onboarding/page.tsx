import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai-ds";
import { Breadcrumbs } from "@/components/opai-ds";
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
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/hub" },
          { label: "Personas", href: "/personas/guardias" },
          { label: "Onboarding" },
        ]}
        className="mb-2"
      />
      <PageHeader
        title="Onboarding"
        description="Estado de onboarding de guardias — emails enviados, acceso a portales y progreso."
        backHref="/personas/guardias"
        backLabel="Personas"
      />
      <OnboardingDashboardClient
        tenantId={tenantId}
        userRole={session.user.role}
      />
    </div>
  );
}
