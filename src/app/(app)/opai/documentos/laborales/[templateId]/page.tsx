import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { TemplateScopeSignersClient } from "@/components/docs/laborales/TemplateScopeSignersClient";

export default async function LaboralTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await auth();
  const { templateId } = await params;
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/opai/documentos/laborales/${templateId}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/opai/documentos/laborales");
  }
  return <TemplateScopeSignersClient templateId={templateId} />;
}
