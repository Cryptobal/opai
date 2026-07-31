/** POST /api/crm/correos/[threadId]/associate — vincula hilo a cuenta y/o negocio. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { normalizeEmailAddress } from "@/lib/email-address";
import { auditEmailAction } from "@/lib/audit-email";
import { materializeSharedThreadAttachments } from "@/modules/crm/email/share-materialize";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

type Ctx = { params: Promise<{ threadId: string }> };
type Body = { accountId?: string | null; dealId?: string | null; sharedWithAccount?: boolean };

export async function POST(req: NextRequest, ctx: Ctx) {
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

  const body = (await req.json().catch(() => ({}))) as Body;

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, accountId: true, dealId: true, sharedWithAccount: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const hasAccountId = "accountId" in body;
  const hasDealId = "dealId" in body;
  let newAccountId = hasAccountId
    ? typeof body.accountId === "string"
      ? body.accountId
      : null
    : thread.accountId;
  let newDealId = hasDealId
    ? typeof body.dealId === "string"
      ? body.dealId
      : null
    : thread.dealId;

  if (!newAccountId) newDealId = null;
  else if (hasAccountId && body.accountId !== thread.accountId && !hasDealId) newDealId = null;

  const crmAccount = newAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: newAccountId, tenantId },
        select: { id: true, name: true, website: true },
      })
    : null;
  if (newAccountId && !crmAccount) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  // La cuenta de la propia empresa del tenant no es un cliente: no asociar hilos.
  if (crmAccount) {
    const { isOwnCompanyAccount, loadOwnTenant } = await import(
      "@/modules/crm/email/own-tenant-company"
    );
    const own = await loadOwnTenant(tenantId);
    if (isOwnCompanyAccount(crmAccount, own)) {
      return NextResponse.json(
        {
          error:
            "No se puede asociar un correo a la cuenta de tu propia empresa. Elegí la cuenta del cliente.",
        },
        { status: 400 },
      );
    }
  }

  // Permite asociar negocios abiertos o cerrados (won/lost): el hilo puede
  // referirse a una oportunidad ya resuelta (post-mortem, reclamaciones, etc.).
  let dealTitle: string | null = null;
  if (newAccountId && newDealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: newDealId, tenantId, accountId: newAccountId },
      select: { id: true, title: true },
    });
    if (!deal) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
    dealTitle = deal.title;
  } else if (newDealId) {
    newDealId = null;
  }

  let contactId: string | null = null;
  if (crmAccount) {
    const messages = await prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      select: { fromEmail: true, toEmails: true },
    });
    const emails = new Set<string>();
    for (const m of messages) {
      if (m.fromEmail) emails.add(normalizeEmailAddress(m.fromEmail));
      for (const e of m.toEmails) emails.add(normalizeEmailAddress(e));
    }
    const contacts = await prisma.crmContact.findMany({
      where: { tenantId, accountId: crmAccount.id, email: { not: null } },
      select: { id: true, email: true },
    });
    contactId = contacts.find((c) => c.email && emails.has(normalizeEmailAddress(c.email)))?.id ?? null;
  }

  // Bloque 5: "asociar = compartir". Al asociar una cuenta el hilo queda
  // visible en su ficha (default true); el toggle puede dejarlo privado sin
  // desasociar. Sin cuenta, la visibilidad no aplica (se conserva el valor).
  const sharedWithAccount =
    typeof body.sharedWithAccount === "boolean" ? body.sharedWithAccount : thread.sharedWithAccount;

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      accountId: crmAccount?.id ?? null,
      dealId: newDealId,
      contactId: crmAccount ? contactId : null,
      sharedWithAccount,
    },
  });

  // B7: al pasar a compartido con una cuenta (asociación nueva o re-compartir),
  // materializar sus adjuntos a R2 para que la ficha no dependa del Gmail del
  // dueño. Idempotente (dedupe por hash), no bloquea la respuesta.
  const becameShared =
    Boolean(crmAccount) &&
    sharedWithAccount &&
    (thread.accountId !== crmAccount!.id || !thread.sharedWithAccount);
  if (becameShared && crmAccount) {
    void materializeSharedThreadAttachments({
      tenantId,
      userId: session.user.id,
      threadId: thread.id,
      accountId: crmAccount.id,
    });
  }

  void auditEmailAction({
    tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: "associate",
    entityType: "email_thread",
    entityId: thread.id,
    meta: {
      accountId: crmAccount?.id ?? null,
      dealId: newDealId,
      contactId: crmAccount ? contactId : null,
    },
  });

  return NextResponse.json({
    ok: true,
    accountId: crmAccount?.id ?? null,
    accountName: crmAccount?.name ?? null,
    dealId: newDealId,
    dealTitle,
    contactId,
    sharedWithAccount,
  });
}
