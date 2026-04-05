import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { getAtsConfig } from "@/lib/ats/config";
import { getAtsSnippets } from "@/lib/ats/snippets";
import { AtsConfigClient } from "@/components/ats/AtsConfigClient";

export default async function AtsConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/ats");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ats")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const [config, snippets, tenantRow] = await Promise.all([
    getAtsConfig(tenantId),
    getAtsSnippets(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración ATS"
        description="Ajusta los pesos del match score, canales y parámetros de distribución."
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <AtsConfigClient
        initialConfig={config}
        tenantSlug={tenantRow?.slug || ""}
        initialSnippets={snippets}
      />
    </div>
  );
}
