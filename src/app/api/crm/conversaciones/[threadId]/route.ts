/**
 * GET /api/crm/conversaciones/[threadId]?entityType=&entityId=
 *
 * Detalle de un hilo compartido, autorizado por la ENTIDAD. Sirve 100% desde
 * el espejo local. Incluye toEmails/ccEmails/htmlBody para armar respuestas.
 * La autorización replica exactamente las reglas del listado (directos +
 * heredados) vía authorizeEntityThread().
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canEdit } from "@/lib/permissions";
import { getEntityThreadDetail } from "@/modules/crm/email/entity-thread";
import {
  CONVERSATION_ENTITY_TYPES,
  authorizeEntityThread,
  type ConversationEntityType,
} from "@/modules/crm/email/entity-conversations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = auth.tenantId;
  const perms = await resolveApiPerms(auth);

  const { threadId } = await ctx.params;
  const entityType = req.nextUrl.searchParams.get("entityType") as ConversationEntityType | null;
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (
    !entityType ||
    !(CONVERSATION_ENTITY_TYPES as readonly string[]).includes(entityType) ||
    !entityId
  ) {
    return NextResponse.json({ error: "entityType/entityId requeridos" }, { status: 400 });
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      contactId: true,
      emailAccountId: true,
      sharedWithAccount: true,
      attachmentsMeta: true,
    },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const allowed = await authorizeEntityThread({
    prisma,
    tenantId,
    perms,
    entityType,
    entityId,
    thread: {
      id: thread.id,
      accountId: thread.accountId,
      dealId: thread.dealId,
      contactId: thread.contactId,
      sharedWithAccount: thread.sharedWithAccount,
    },
  });

  if (!allowed) {
    return NextResponse.json({ error: "Sin acceso a esta conversación" }, { status: 403 });
  }

  const mailbox = thread.emailAccountId
    ? await prisma.crmEmailAccount.findFirst({
        where: {
          id: thread.emailAccountId,
          tenantId,
          provider: "gmail",
          status: "active",
        },
        select: { email: true, userId: true },
      })
    : null;
  const isOwnMailbox = Boolean(mailbox && mailbox.userId === auth.userId);
  const canReply = isOwnMailbox && canEdit(perms, "productividad", "correos");
  // Nota de casilla ajena solo si no es propia; sin permiso de escritura → sin nota.
  const ownerEmail =
    canReply || !isOwnMailbox ? (mailbox?.email ?? null) : null;

  const detail = await getEntityThreadDetail({
    tenantId,
    threadId: thread.id,
    subject: thread.subject,
    attachmentsMeta: thread.attachmentsMeta,
    accountId: thread.accountId,
    dealId: thread.dealId,
    contactId: thread.contactId,
  });
  return NextResponse.json({
    ...detail,
    canReply,
    ownerEmail,
    associations: {
      accountId: thread.accountId,
      dealId: thread.dealId,
      contactId: thread.contactId,
    },
  });
}
