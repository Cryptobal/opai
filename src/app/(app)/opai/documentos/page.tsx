import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocsClient } from "@/components/docs/DocsClient";
import { PageHero } from "@/components/opai-ds";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function DocumentosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
<PageHero
        icon={<FileText />}
        iconTone="rose"
        title="Documentos"
        subtitle="gestión documental"
        description="Documentos comerciales, contratos y archivos compartidos."
      />
      <DocsClient />
    </div>
  );
}
