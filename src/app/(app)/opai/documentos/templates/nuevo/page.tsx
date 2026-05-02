import { FilePlus } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocTemplateEditorClient } from "@/components/docs/DocTemplateEditorClient";
import { PageHero } from "@/components/opai-ds";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function NewDocTemplatePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/templates/nuevo");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/opai/documentos/templates");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FilePlus />}
        iconTone="rose"
        eyebrow={["Documentos", "Plantillas", "Nueva"]}
        title="Nueva plantilla"
        subtitle="crear plantilla de documento"
      />
      <DocumentosSubnav />
      <DocTemplateEditorClient />
    </div>
  );
}
