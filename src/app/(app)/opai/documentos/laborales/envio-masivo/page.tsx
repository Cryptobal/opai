import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Spinner } from "@/components/opai-ds";
import { BulkSendWizard } from "@/components/docs/laborales/BulkSendWizard";

export default async function LaboralesBulkPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/laborales/envio-masivo");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/opai/documentos/laborales");
  }
  return (
    <Suspense fallback={<Spinner />}>
      <BulkSendWizard />
    </Suspense>
  );
}
