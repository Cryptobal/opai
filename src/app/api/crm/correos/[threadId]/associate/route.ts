/** POST /api/crm/correos/[threadId]/associate — vincula el hilo a una cuenta. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { normalizeEmailAddress } from "@/lib/email-address";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { accountId?: string | null };
  const accountId = typeof body.accountId === "string" ? body.accountId : null;

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const crmAccount = accountId
    ? await prisma.crmAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true, name: true } })
    : null;
  if (accountId && !crmAccount) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  // Re-match de contacto dentro de la cuenta por los emails del hilo.
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

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: { accountId: crmAccount?.id ?? null, ...(contactId ? { contactId } : {}) },
  });

  return NextResponse.json({
    ok: true,
    accountId: crmAccount?.id ?? null,
    accountName: crmAccount?.name ?? null,
    contactId,
  });
}
