import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocsOperativosClient } from "@/components/docs/DocsOperativosClient";

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
    <div className="space-y-4">
      <DocumentosSubnav />
      <div>
        <h1 className="text-xl font-bold">Documentos Operativos</h1>
        <p className="text-sm text-muted-foreground">
          Control de cumplimiento documental digital y físico por instalación
        </p>
      </div>
      <DocsOperativosClient />
    </div>
  );
}
