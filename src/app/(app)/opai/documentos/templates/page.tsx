import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocTemplatesClient } from "@/components/docs/DocTemplatesClient";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function DocTemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/templates");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "presentaciones")) {
    redirect("/opai/inicio");
  }

  return (
    <div className="space-y-6 min-w-0">
      <DocumentosSubnav />
      <DocTemplatesClient />
    </div>
  );
}
