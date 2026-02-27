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

  let [account, quotes] = await Promise.all([
    prisma.crmAccount.findFirst({
      where: { id, tenantId },
      include: {
        contacts: { orderBy: { createdAt: "desc" } },
        deals: {
          include: { stage: true, primaryContact: true },
          orderBy: { createdAt: "desc" },
        },
        installations: { orderBy: { createdAt: "desc" } },
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
    }),
    prisma.cpqQuote.findMany({
      where: { accountId: id, tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true, status: true, clientName: true, monthlyCost: true, createdAt: true },
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
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
    }) ?? account;
  }

  const data = JSON.parse(JSON.stringify({ ...account, quotes }));

  const lifecycle =
    account.status === "prospect" || account.status === "client_active" || account.status === "client_inactive"
      ? account.status
      : account.type === "prospect"
      ? "prospect"
      : account.isActive
      ? "client_active"
      : "client_inactive";

  return (
    <>
      <CrmAccountDetailClient
        account={data}
        quotes={data.quotes || []}
        currentUserId={session.user.id}
      />
    </>
  );
}
