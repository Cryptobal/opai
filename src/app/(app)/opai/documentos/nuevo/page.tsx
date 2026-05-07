import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ModuleSubNav } from "@/components/opai-ds";
import { DocGenerateClient } from "@/components/docs/DocGenerateClient";
import { Suspense } from "react";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function NewDocumentPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/nuevo");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/opai/documentos");
  }

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="docs" />
      <Suspense>
        <DocGenerateClient />
      </Suspense>
    </div>
  );
}
