/**
 * CRM Account Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { CrmAccountDetailClient } from "@/components/crm/CrmAccountDetailClient";
export default async function CrmAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/accounts/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "accounts")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  let [account, quotes, activityLogs] = await Promise.all([
    prisma.crmAccount.findFirst({
      where: { id, tenantId },
      include: {
        contacts: { orderBy: { createdAt: "desc" } },
        deals: {
          include: { stage: true, primaryContact: true },
          orderBy: { createdAt: "desc" },
        },
        installations: { orderBy: { createdAt: "desc" } },
        representantesLegales: { orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, rut: true } },
        personeria: { select: { id: true, fechaEscritura: true, tipoEscritura: true, notaria: true } },
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
    }),
    prisma.cpqQuote.findMany({
      where: { accountId: id, tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, status: true, clientName: true, monthlyCost: true, createdAt: true },
    }),
    prisma.crmHistoryLog.findMany({
      where: { tenantId, entityType: "account", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  if (!account) {
    redirect("/crm/accounts");
  }

  // Un solo contacto principal por cuenta: si hay más de uno, normalizar (dejar el primero)
  const primaryContacts = account.contacts?.filter((c) => c.isPrimary) ?? [];
  if (primaryContacts.length > 1) {
    const keepId = primaryContacts[0].id;
    await prisma.crmContact.updateMany({
      where: { accountId: account.id },
      data: { isPrimary: false },
    });
    await prisma.crmContact.update({ where: { id: keepId }, data: { isPrimary: true } });
    account = await prisma.crmAccount.findFirst({
      where: { id, tenantId },
      include: {
        contacts: { orderBy: { createdAt: "desc" } },
        deals: { include: { stage: true, primaryContact: true }, orderBy: { createdAt: "desc" } },
        installations: { orderBy: { createdAt: "desc" } },
        representantesLegales: { orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, rut: true } },
        personeria: { select: { id: true, fechaEscritura: true, tipoEscritura: true, notaria: true } },
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
    }) ?? account;
  }

  const data = JSON.parse(JSON.stringify({ ...account, quotes }));
  const actorIds = Array.from(
    new Set(activityLogs.map((log) => log.createdBy).filter((id): id is string => Boolean(id)))
  );
  const actors = actorIds.length
    ? await prisma.admin.findMany({
        where: { tenantId, id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorMap = new Map(actors.map((user) => [user.id, user.name]));
  const logEvents = activityLogs.map((log) => ({
    ...log,
    createdByName: log.createdBy ? actorMap.get(log.createdBy) ?? null : null,
  }));

  // Tracking de uso del portal del cliente (solo actividad, no genera notificaciones)
  const portalAccessEvents = (account.contacts ?? [])
    .filter((c: any) => c.portalLastAccessAt)
    .map((c: any) => ({
      id: `portal-access-${c.id}`,
      action: "portal_cliente_access",
      createdAt: c.portalLastAccessAt instanceof Date ? c.portalLastAccessAt.toISOString() : String(c.portalLastAccessAt),
      createdBy: null as string | null,
      createdByName: null as string | null,
      details: {
        contactName: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Contacto",
        ip: c.portalLastAccessIp ?? null,
      },
    }));

  const activityEvents = [...logEvents, ...portalAccessEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const lifecycle =
    account.status === "prospect" || account.status === "client_active" || account.status === "client_inactive"
      ? account.status
      : account.type === "prospect"
      ? "prospect"
      : account.isActive
      ? "client_active"
      : "client_inactive";

  return (
    <CrmAccountDetailClient
      account={data}
      quotes={data.quotes || []}
      activityEvents={JSON.parse(JSON.stringify(activityEvents))}
      currentUserId={session.user.id}
    />
  );
}
