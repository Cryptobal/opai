/**
 * CRM - Detalle de Cotización (CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/opai";
import { CpqQuoteDetail } from "@/components/cpq/CpqQuoteDetail";
import { CpqIndicators } from "@/components/cpq/CpqIndicators";
import { z } from "zod";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildDefaultPortalInviteEmailSubject } from "@/lib/cpq-portal-email-subject";

const uuidSchema = z.string().uuid();

export default async function CrmCotizacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/cotizaciones/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "quotes")) redirect("/crm");
  const tenantId = session.user.tenantId;
  const isUuid = uuidSchema.safeParse(id).success;
  const quote = isUuid
    ? await prisma.cpqQuote.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          installation: { select: { name: true } },
        },
      })
    : await prisma.cpqQuote.findFirst({
        where: { code: id, tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          installation: { select: { name: true } },
        },
      });

  if (!quote) {
    redirect("/crm/cotizaciones");
  }

  // Compatibilidad para links legacy por código o rutas antiguas.
  if (quote.id !== id) {
    redirect(`/crm/cotizaciones/${quote.id}`);
  }

  const activityLogs = await prisma.crmHistoryLog.findMany({
    where: { tenantId, entityType: "quote", entityId: quote.id },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  const activityActorIds = Array.from(
    new Set(activityLogs.map((log) => log.createdBy).filter((actorId): actorId is string => Boolean(actorId)))
  );
  const activityActors =
    activityActorIds.length > 0
      ? await prisma.admin.findMany({
          where: { tenantId, id: { in: activityActorIds } },
          select: { id: true, name: true },
        })
      : [];
  const activityActorMap = new Map(activityActors.map((a) => [a.id, a.name]));
  const activityEvents = activityLogs.map((log) => ({
    id: log.id,
    action: log.action,
    details: (log.details as Record<string, unknown>) ?? {},
    createdAt: log.createdAt.toISOString(),
    createdBy: log.createdBy ?? null,
    createdByName: log.createdBy ? activityActorMap.get(log.createdBy) ?? null : null,
  }));

  const tenantCfg = await getTenantCompanyConfig(tenantId);
  const defaultPortalEmailSubject = buildDefaultPortalInviteEmailSubject({
    quoteCode: quote.code,
    quoteName: quote.name,
    installationName: quote.installation?.name ?? null,
    tenantBrand: tenantCfg.commercialName,
  });
  const tenantBrandName = tenantCfg.commercialName?.trim() || "OPAI";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "CRM", href: "/crm" },
          { label: "Cotizaciones", href: "/crm/cotizaciones" },
          { label: quote?.code || id },
        ]}
        className="mb-1"
      />
      <div className="mb-1">
        <CpqIndicators />
      </div>
      <CpqQuoteDetail
        quoteId={id}
        currentUserId={session.user.id}
        activityEvents={activityEvents}
        defaultPortalEmailSubject={defaultPortalEmailSubject}
        tenantBrandName={tenantBrandName}
      />
    </>
  );
}
