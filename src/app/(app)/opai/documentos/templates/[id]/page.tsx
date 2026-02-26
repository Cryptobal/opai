import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocTemplateEditorClient } from "@/components/docs/DocTemplateEditorClient";
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
  if (!canView(perms, "docs", "presentaciones")) {
    redirect("/opai/documentos/templates");
  }

  return (
    <div className="space-y-6 min-w-0">
      <DocumentosSubnav />
      <DocTemplateEditorClient templateId={id} />
    </div>
  );
}
