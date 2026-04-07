import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { AtsCreateJobClient } from "@/components/ats/AtsCreateJobClient";
import { getAtsSnippets } from "@/lib/ats/snippets";
import { getAtsConfig } from "@/lib/ats/config";

export default async function AtsNuevoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/ats/nuevo");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ats")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const [installations, snippets, atsConfig] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, commune: true, lat: true, lng: true },
      orderBy: { name: "asc" },
    }),
    getAtsSnippets(tenantId),
    getAtsConfig(tenantId),
  ]);

  // Pre-check every channel that the tenant has enabled in ATS settings, so
  // newly configured integrations (BNE, Indeed, …) appear ticked by default.
  const enabledChannels = Object.entries(atsConfig.channelConfigs ?? {})
    .filter(([, ch]) => ch.enabled)
    .map(([key]) => key);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Nuevo aviso de empleo"
        description="Crea un aviso y publícalo en portales de empleo."
        backHref="/ops/ats"
        backLabel="ATS"
      />
      <AtsCreateJobClient
        installations={JSON.parse(JSON.stringify(installations))}
        snippets={snippets}
        defaultCanales={enabledChannels}
      />
    </div>
  );
}
