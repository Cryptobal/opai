import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { AlertasCoberturaClient } from "@/components/ops/alertas-cobertura/AlertasCoberturaClient";

export default async function AlertasCoberturaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/alertas-cobertura");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <Suspense>
        <AlertasCoberturaClient
          userRole={session.user.role}
          tenantId={(session.user as any).tenantId}
        />
      </Suspense>
    </div>
  );
}
