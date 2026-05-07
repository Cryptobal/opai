import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocTemplatesClient } from "@/components/docs/DocTemplatesClient";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function DocTemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/templates");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "plantillas")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="docs" />
      <PageHero
        icon={<FileText />}
        iconTone="rose"
        eyebrow={["Documentos", "Plantillas"]}
        title="Plantillas"
        subtitle="contratos, anexos y cláusulas"
      />
      <DocTemplatesClient />
    </div>
  );
}
