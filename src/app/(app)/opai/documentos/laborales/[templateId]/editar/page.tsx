import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DocTemplateEditorClient } from "@/components/docs/DocTemplateEditorClient";

export default async function LaboralTemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await auth();
  const { templateId } = await params;
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/opai/documentos/laborales/${templateId}/editar`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/opai/documentos/laborales");
  }
  return <DocTemplateEditorClient templateId={templateId} />;
}
