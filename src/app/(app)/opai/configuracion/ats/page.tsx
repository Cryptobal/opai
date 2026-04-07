import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { getAtsConfig } from "@/lib/ats/config";
import { getAtsSnippets } from "@/lib/ats/snippets";
import { AtsConfigClient } from "@/components/ats/AtsConfigClient";
import { maskSecret } from "@/lib/ats/bne.service";
import { Briefcase } from "lucide-react";

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
  const [config, snippets, tenantRow, bneRow] = await Promise.all([
    getAtsConfig(tenantId),
    getAtsSnippets(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    }),
    prisma.bneIntegration
      .findUnique({ where: { tenantId } })
      .catch(() => null),
  ]);

  const initialBneConfig = bneRow
    ? {
        configured: !!bneRow.consumerKey,
        consumerKeyPreview: maskSecret(bneRow.consumerKey),
        hasSecret: !!bneRow.consumerSecretEncrypted,
        environment: (bneRow.environment as "prod" | "test") ?? "prod",
        rutEmpleador: bneRow.rutEmpleador,
        idEmpleador: bneRow.idEmpleador,
        idUsuarioPublicador: bneRow.idUsuarioPublicador,
        mostrarNombreEmpresa: bneRow.mostrarNombreEmpresa,
        defaultDiasPublicacion: bneRow.defaultDiasPublicacion,
        status: bneRow.status as "pending" | "active" | "error",
        lastSyncAt: bneRow.lastSyncAt?.toISOString() ?? null,
        lastError: bneRow.lastError,
        jobCount: bneRow.jobCount,
      }
    : { configured: false as const };

  return (
    <ConfigPageLayout
      title="ATS — Reclutamiento"
      description="Ajusta los pesos del match score, canales y parámetros de distribución."
      icon={<Briefcase className="h-[18px] w-[18px]" />}
    >
      <AtsConfigClient
        initialConfig={config}
        tenantSlug={tenantRow?.slug || ""}
        initialSnippets={snippets}
        initialBneConfig={initialBneConfig}
      />
    </ConfigPageLayout>
  );
}
