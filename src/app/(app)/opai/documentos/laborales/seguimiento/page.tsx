import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Spinner } from "@/components/opai-ds";
import { TrackingClient } from "@/components/docs/laborales/TrackingClient";

export default async function LaboralesTrackingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/laborales/seguimiento");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/hub");
  }
  return (
    <Suspense fallback={<Spinner />}>
      <TrackingClient />
    </Suspense>
  );
}
