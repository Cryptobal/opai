import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocsOperativosClient } from "@/components/docs/DocsOperativosClient";
import { PageHero } from "@/components/opai-ds";

export const metadata = { title: "Docs Operativos — OPAI" };

export default async function DocsOperativosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos-operativos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/opai/inicio");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<ClipboardList />}
        iconTone="rose"
        eyebrow={["Documentos", "Operativos"]}
        title="Documentos Operativos"
        subtitle="cumplimiento documental"
        description="Control de cumplimiento documental digital y físico por instalación."
      />
      <DocumentosSubnav />
      <DocsOperativosClient />
    </div>
  );
}
