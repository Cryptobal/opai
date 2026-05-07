import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocTemplateEditorClient } from "@/components/docs/DocTemplateEditorClient";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function EditDocTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/opai/documentos/templates/${id}`);
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "plantillas")) {
    redirect("/opai/documentos/templates");
  }

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="docs" />
      <PageHero
        icon={<FileText />}
        iconTone="rose"
        eyebrow={["Documentos", "Plantillas", "Editar"]}
        title="Editor de plantilla"
        subtitle="diseño, tokens y cláusulas"
      />
      <DocTemplateEditorClient templateId={id} />
    </div>
  );
}
