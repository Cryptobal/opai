/**
 * GET /api/crm/correos/[threadId]/contact-context (P11, PR-14):
 * ficha del contacto asociado al hilo (cargo, teléfono, empresa, deals
 * abiertos) + últimas 5 conversaciones de ese contacto con deep-link.
 * Aislado por tenant y por casilla del usuario.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const { threadId } = await ctx.params;

  const owned = await requireThreadMailbox({
    tenantId,
    userId: session.user.id,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, contactId: true },
  });
  if (!thread?.contactId) return NextResponse.json({ contact: null });

  const contact = await prisma.crmContact.findFirst({
    where: { id: thread.contactId, tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleTitle: true,
      accountId: true,
    },
  });
  if (!contact) return NextResponse.json({ contact: null });

  const [crmAccount, openDeals, recentThreads] = await Promise.all([
    contact.accountId
      ? prisma.crmAccount.findFirst({
          where: { id: contact.accountId, tenantId },
          select: { id: true, name: true },
        })
      : null,
    contact.accountId
      ? prisma.crmDeal.findMany({
          where: { tenantId, accountId: contact.accountId, status: "open" },
          select: { id: true, title: true, amount: true },
          orderBy: { updatedAt: "desc" },
          take: 5,
        })
      : [],
    prisma.crmEmailThread.findMany({
      where: {
        tenantId,
        emailAccountId: account.id,
        contactId: contact.id,
        id: { not: thread.id },
        trashedAt: null,
        spamAt: null,
      },
      select: { id: true, subject: true, lastMessageAt: true },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
      phone: contact.phone,
      roleTitle: contact.roleTitle,
      accountId: crmAccount?.id ?? null,
      accountName: crmAccount?.name ?? null,
    },
    openDeals: openDeals.map((d) => ({ id: d.id, title: d.title })),
    recentThreads: recentThreads.map((t) => ({
      id: t.id,
      subject: t.subject,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    })),
  });
}
