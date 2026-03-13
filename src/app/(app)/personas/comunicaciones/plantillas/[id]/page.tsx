import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import TemplateEditorClient from "@/components/comunicaciones/TemplateEditorClient";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/comunicaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const { id } = await params;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col min-w-0 overflow-hidden">
      <TemplateEditorClient
        templateId={id === "new" ? undefined : id}
        tenantId={tenantId}
      />
    </div>
  );
}
