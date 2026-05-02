import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Sparkles } from "lucide-react";
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
      <PageHero
        icon={<Sparkles />}
        iconTone="sky"
        eyebrow={["Personas", "Onboarding"]}
        title="Onboarding"
        subtitle="estado y progreso de guardias"
        description="Estado de onboarding de guardias — emails enviados, acceso a portales y progreso."
      />
      <OnboardingDashboardClient
        tenantId={tenantId}
        userRole={session.user.role}
      />
    </div>
  );
}
